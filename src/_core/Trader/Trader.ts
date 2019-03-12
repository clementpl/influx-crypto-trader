import { Market, Order } from 'ccxt';
import * as moment from 'moment';
import { EnvConfig, Env } from '../Env/Env';
import { CandleSet } from '../Env/CandleSet';
import { Candle } from '../Env/Candle';
import { Exchange } from './Exchange/Exchange';
import { logger } from '../../logger';
import { Portfolio } from './Portfolio/Portfolio';
import { TraderModel } from './model';
import { Influx } from '../Influx/Influx';
import { MEASUREMENT_INPUTS } from '../Influx/constants';
import { flatten, requireUncached } from '../helpers';

export interface TraderConfig {
  name: string;
  env: EnvConfig;
  strategie: string;
  stratOpts: any;
  capital: number;
  percentInvest: number;
  test: boolean;
  base: string;
  quote: string;
  exchange: {
    name: string;
    apiKey?: string;
    apiSecret?: string;
  };
}

export enum Status {
  RUNNING = 'RUNNING',
  STOP = 'STOP',
  ERROR = 'ERROR',
}

/**
 * Trader is use to run a strategy on the configured environment (live/simulation/backtest)
 * This class take care of calculating different protfolio metric and flushing it to influxDB
 *
 * @export
 * @class Trader
 */
export class Trader {
  public env: Env;
  public portfolio: Portfolio;
  public status: Status;
  public strategy: {
    beforeAll?: (env: EnvConfig, trader: Trader, stratOpts: any) => Promise<void>;
    before?: (candleSet: CandleSet, trader: Trader, stratOpts: any) => Promise<void>;
    run: (candleSet: CandleSet, trader: Trader, stratOpts: any) => Promise<string>;
    after?: (candleSet: CandleSet, trader: Trader, stratOpts: any) => Promise<void>;
    afterAll?: (candleSet: CandleSet, trader: Trader, stratOpts: any) => Promise<void>;
  };
  // Hook can be usefull for ML algorithm (Override if after creating trader)
  public afterStrategy: (candleSet: CandleSet | undefined, trader: Trader, error?: boolean) => Promise<void>;
  private influx: Influx;
  private symbol: string;
  private exchange: Exchange;
  private isBacktesting: boolean;
  private currentOrder: Order | undefined;
  private shouldStop: boolean = false;
  // Buffer for writing candles data (with indicators) to influxDB
  private bufferInputs: any[] = [];
  private lastBufferFlush: moment.Moment = moment();

  constructor(public config: TraderConfig) {
    this.symbol = Env.makeSymbol({
      base: this.config.base,
      exchange: this.config.exchange.name,
      quote: this.config.quote,
    });
    this.isBacktesting = config.env.backtest ? true : false;
  }

  /**
   * Init the trader
   * Bind the strategy, Init the environment, create the echange, create the portfolio
   *
   * @returns {Promise<void>}
   * @memberof Trader
   */
  public async init(): Promise<void> {
    try {
      // Bind trader strategy if needed (override allowed)
      if (!this.strategy) {
        // Reload strategy module
        this.strategy = requireUncached(`${process.cwd()}/strategies/${this.config.strategie}`).default;
      }
      // beforeAll callback (can be use to change config or set fixed indicator for the strat)
      if (this.strategy.beforeAll) await this.strategy.beforeAll(this.config.env, this, this.config.stratOpts);

      // Init Env
      this.env = new Env(this.config.env);
      this.influx = await this.env.init();
      await this.cleanInflux();
      // Init exchange
      this.exchange = new Exchange({
        name: this.config.exchange.name,
        test: true, // TODO Change test here
      });
      // Init portfolio
      this.portfolio = new Portfolio({
        name: this.config.name,
        capital: this.config.capital,
        base: this.config.base,
        quote: this.config.quote,
        exchange: this.config.exchange.name,
        backtest: this.config.env.backtest ? true : false,
      });
      await this.portfolio.init(this.influx);
    } catch (error) {
      logger.error(error);
      throw new Error(`[${this.config.name}] Problem during trader initialization`);
    }
  }

  /**
   * Stop the trader (stop environment)
   *
   * @returns {Promise<void>}
   * @memberof Trader
   */
  public async stop(): Promise<void> {
    this.status = Status.STOP;
    this.shouldStop = true;
    this.env.stop();
    await this.portfolio.flush(true);
    await this.save();
    logger.info(`[${this.config.name}] Trader ${this.config.name} stopped`);
  }

  /**
   * Start the trader, loop over environment candle generator
   *
   * @returns {Promise<void>}
   * @memberof Trader
   */
  public async start(): Promise<void> {
    try {
      // Set trader status and save
      this.shouldStop = false;
      this.status = Status.RUNNING;
      await this.save();
      logger.info(
        `[${this.config.name}] Trader ${this.config.name} started on ${this.config.base}/${this.config.quote}`
      );

      // Get generator and fetch first candles (warmup)
      const fetcher = this.env.getGenerator();
      let data = await fetcher.next();
      // Init last candle, candleSet
      let candleSet: CandleSet | undefined = <CandleSet>data.value;
      let lastCandle = <Candle>candleSet.getLast(this.symbol);
      while (!this.shouldStop && !data.done) {
        // console.time('begin');
        this.checkTrader();
        // Push indicators to bufferInputs (will write it to influx)
        if (Object.keys(lastCandle.indicators || {}).length > 0) {
          // TODO Write multiple INPUT serie (ETH,BTC, ETH15m, BTC15m, ...)
          this.bufferInputs.push({
            time: lastCandle.time,
            values: flatten(lastCandle.indicators),
            // tags: ... TODO add aggTimes (loop over it and push with)
          });
        }
        // Update portfolio with new candle
        await this.portfolio.save(lastCandle);
        // Persist inputs to influx
        await this.flushInputs();

        // Before strat callback
        if (this.strategy.before) await this.strategy.before(candleSet, this, this.config.stratOpts);
        // Run strategy
        const advice = await this.strategy.run(candleSet, this, this.config.stratOpts);
        // Check if advice is correct (cant buy more than one order at a time)
        const error = this.checkAdvice(advice);
        // Process advice (if error => wait)
        if (!error) {
          if (advice === 'buy') {
            await this.buy(lastCandle);
          } else if (advice === 'sell') {
            await this.sell(lastCandle);
          }
        } else {
          // WAIT
          logger.info(error);
        }

        // After strat callback
        if (this.strategy.after) await this.strategy.after(candleSet, this, this.config.stratOpts);

        // Get next step
        data = await fetcher.next();
        // Set new candleSet, lastCandle
        if (data.value) {
          candleSet = <CandleSet>data.value;
          lastCandle = <Candle>candleSet.getLast(this.symbol);
        } // else candleSet = undefined;
      }

      if (this.strategy.afterAll) await this.strategy.afterAll(candleSet, this, this.config.stratOpts);

      // Flush buffer (write it to influx)
      await this.flushInputs(true);
      await this.portfolio.flush(true);
    } catch (error) {
      await this.flushInputs(true);
      await this.portfolio.flush(true);
      this.status = Status.ERROR;
      throw error;
    }
  }

  /**
   * Delete the trader related data from InfluxDB and MongoDB
   *
   * @returns {Promise<void>}
   * @memberof Trader
   */
  public async delete(): Promise<void> {
    await this.portfolio.cleanInflux();
    await TraderModel.findOneAndDelete({ name: this.config.name });
  }

  /**
   * Reset the portfolio
   *
   * @memberof Trader
   */
  public resetPortfolio(): void {
    this.portfolio.reset();
  }

  /**
   * Check if trader can trade
   *
   * @private
   * @memberof Trader
   */
  private checkTrader() {
    if (this.portfolio.indicators.currentProfit < -0.5) {
      throw new Error(`[${this.config.name}] Stop trader too much damage (50% deficit)`);
    }
  }
  /**
   * Helper check if advice is correct (follow buy/sell/buy/sell)
   *
   * @private
   * @param {string} advice
   * @memberof Trader
   */
  private checkAdvice(advice: string): string | undefined {
    let error;
    if (advice === 'buy' && this.currentOrder) {
      error = `[${this.config.name}] Trying to buy but there is already one order bought`;
      // throw new Error('[Trader] Trying to buy but there is already one order bought');
    }
    if (advice === 'sell' && !this.currentOrder) {
      error = `[${this.config.name}] Trying to sell but there is no order to sell`;
      // throw new Error('[Trader] Trying to sell but there is no order to sell');
    }
    return error;
  }

  /**
   * Buy an order
   *
   * @private
   * @param {Candle} lastCandle
   * @returns {Promise<void>}
   * @memberof Trader
   */
  private async buy(lastCandle: Candle): Promise<void> {
    try {
      const exchangeInfo: Market = await this.exchange.getExchangeInfo(this.config.base, this.config.quote);
      const minCost = exchangeInfo.limits.cost ? exchangeInfo.limits.cost.min : 0;
      if (this.portfolio.indicators.currentCapital < minCost) {
        logger.error(
          `[${this.config.name}] Capital not sufficient to buy in market (${this.symbol}), currentCapital: ${
            this.config.capital
          }`
        );
        await this.stop();
      }
      const investExpected = this.portfolio.indicators.currentCapital * this.config.percentInvest;
      const invest = investExpected < minCost ? minCost : investExpected;
      const amount: number = +(invest / lastCandle.close).toFixed(8);
      const order: Order = await this.exchange.buyMarket(this.config.base, this.config.quote, amount, lastCandle);
      this.portfolio.notifyBuy(order);
      this.currentOrder = order;
    } catch (error) {
      logger.error(error);
      throw new Error(`[${this.config.name}] Problem while buying`);
    }
  }

  /**
   * Sell an order
   *
   * @private
   * @param {Candle} lastCandle
   * @returns {Promise<void>}
   * @memberof Trader
   */
  private async sell(lastCandle: Candle): Promise<void> {
    if (this.currentOrder) {
      try {
        const order: Order = await this.exchange.sellMarket(
          this.config.base,
          this.config.quote,
          this.currentOrder.amount,
          lastCandle
        );
        this.portfolio.notifySell(order);
        this.currentOrder = undefined;
      } catch (error) {
        logger.error(error);
        throw new Error(`[${this.config.name}] Problem while selling`);
      }
    }
  }

  /**
   * Save trader in MongoDB
   *
   * @memberof Watcher
   */
  private async save(): Promise<void> {
    try {
      if (!this.isBacktesting) {
        const trader = { ...this.config, status: this.status };
        await TraderModel.findOneAndUpdate({ name: this.config.name }, trader, { upsert: true });
      }
    } catch (error) {
      logger.error(error);
      logger.error(new Error(`[${this.config.name}] Error while saving trader ${this.config.name}`));
    }
  }

  /**
   * Flush related data (portfolio/buy/sell/...)
   *
   * @private
   * @param {boolean} [force=false]
   * @returns {Promise<void>}
   * @memberof Trader
   */
  private async flushInputs(force: boolean = false): Promise<void> {
    try {
      // If data to write and more than 5 second since last save (or force=true)
      if (this.bufferInputs.length > 0 && (force || Math.abs(moment().diff(this.lastBufferFlush, 's')) > 5)) {
        await this.influx.writeData({ name: this.config.name }, this.bufferInputs, MEASUREMENT_INPUTS);
        await this.influx.writeData({ name: this.config.name }, this.bufferInputs, MEASUREMENT_INPUTS);
        this.bufferInputs = [];
        this.lastBufferFlush = moment();
      }
    } catch (error) {
      logger.error(error);
      logger.error(new Error(`[${this.config.name}] Error while saving candles to measurement ${MEASUREMENT_INPUTS}`));
    }
  }

  /**
   * Clean influxDB data related to the trader
   *
   * @private
   * @memberof Trader
   */
  private async cleanInflux() {
    await this.influx.dropSerie(MEASUREMENT_INPUTS, { name: this.config.name });
  }
}
