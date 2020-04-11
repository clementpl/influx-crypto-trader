import { Market, Order } from 'ccxt';
import * as moment from 'moment';
import { logger } from '@src/logger';
import { Influx } from '@core/Influx/Influx';
import { MEASUREMENT_INPUTS, INFLUX_BATCH_WRITE_SIZE } from '@core/Influx/constants';
import { EnvConfig, Env } from '@core/Env/Env';
import { CandleSet } from '@core/Env/CandleSet';
import { Candle } from '@core/Env/Candle';
import { Exchange } from './Exchange/Exchange';
import { Portfolio } from './Portfolio/Portfolio';
import { TraderModel } from './model';
import { flatten, requireUncached } from '../helpers';
import { PortfolioModel } from '@src/_core/Trader/Portfolio/model';

export interface TraderConfig {
  name: string;
  restart?: boolean;
  silent?: boolean;
  flush?: boolean;
  persist?: boolean;
  saveInputs?: boolean;
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
  private shouldStop: boolean = false;
  // Buffer for writing candles data (with indicators) to influxDB
  private bufferInputs: any[] = [];
  private saveInputs: boolean;
  private flushTimeout = 10;
  private lastBufferFlush: number = new Date().getTime();
  private persist: boolean;
  private lastPersistTime: number = new Date().getTime();

  constructor(public config: TraderConfig) {
    this.symbol = Env.makeSymbol({
      base: this.config.base,
      exchange: this.config.exchange.name,
      quote: this.config.quote,
    });
    this.config.flush = this.config.flush === false ? false : true;
    this.saveInputs = this.config.saveInputs ? true : false;
    this.persist = this.config.persist === false ? false : true;
  }

  /**
   * Init the trader
   * Bind the strategy, Init the environment, create the echange, create the portfolio
   *
   * @returns {Promise<void>}
   * @memberof Trader
   */
  public async init(sharedEnvConfig?: EnvConfig): Promise<void> {
    try {
      // Bind trader strategy if needed (override allowed)
      if (!this.strategy) {
        // Reload strategy module
        this.strategy = requireUncached(`${process.cwd()}/strategies/${this.config.strategie}`).default;
      }

      this.config.env = sharedEnvConfig ? sharedEnvConfig : this.config.env;
      // beforeAll callback (can be use to change config or set fixed indicator for the strat)
      if (this.strategy.beforeAll) {
        await this.strategy.beforeAll(this.config.env, this, this.config.stratOpts);
      }

      // Smart aggTimes discovery (from envConfig plugins)
      if (this.config.env.candleSetPlugins) {
        const aggTimePlugins: any[] = this.config.env.candleSetPlugins.map(p => p.opts.aggTime).filter(agg => agg);
        this.config.env.aggTimes = [...new Set(this.config.env.aggTimes.concat(aggTimePlugins))];
      }
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
  public async stop(status?: Status): Promise<void> {
    if (this.status !== Status.STOP) {
      this.status = status || Status.STOP;
      this.shouldStop = true;
      if (this.env) this.env.stop();
      await this.portfolio.flush(true);
      await this.flushInputs(true);
      await this.save(true);
      logger.info(`[${this.config.name}] Trader ${this.config.name} stopped`);
    }
  }

  /**
   * Delete the trader related data from InfluxDB and MongoDB
   *
   * @returns {Promise<void>}
   * @memberof Trader
   */
  public async delete(): Promise<void> {
    await this.stop();
    await this.portfolio.cleanInflux();
    await TraderModel.findOneAndDelete({ name: this.config.name });
    await PortfolioModel.findOneAndDelete({ name: this.config.name });
  }

  /**
   * Init trader for run (Create exchange/portfolio)
   *
   * @returns {Promise<void>}
   * @memberof Trader
   */
  public async initRunning(sharedEnv?: Env): Promise<void> {
    try {
      // Init Env (fetch influx instance)
      this.env = sharedEnv ? sharedEnv : new Env(this.config.env);
      this.influx = await this.env.init();
      if (this.config.flush) await this.cleanInflux();
      // Init exchange
      this.exchange = new Exchange({
        name: this.config.exchange.name,
        test: this.config.test === true ? true : false,
        apiKey: this.config.exchange.apiKey,
        apiSecret: this.config.exchange.apiSecret,
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
      if (this.config.restart) await this.portfolio.reload(this.influx, this.config.flush);
      else await this.portfolio.init(this.influx, this.config.flush);

      // Set trader status and save
      this.status = Status.RUNNING;
      await this.save(true);
      logger.info(
        `[${this.config.name}] Trader ${this.config.name} started on ${this.config.base}/${this.config.quote}`
      );
    } catch (error) {
      logger.error(error);
      throw new Error(`[${this.config.name}] Problem during trader running initialization`);
    }
  }

  /**
   * Start the trader, loop over environment candle generator
   *
   * @returns {Promise<void>}
   * @memberof Trader
   */
  public async start(): Promise<void> {
    try {
      // Init running state
      await this.initRunning();
      this.shouldStop = false;

      // Get generator and fetch first candles (warmup)
      const fetcher = this.env.getGenerator();
      let data = await fetcher.next();
      let candleSet = data.value;

      // Loop over data
      while (!this.shouldStop && !data.done) {
        candleSet = data.value;
        await this.step(candleSet);
        data = await fetcher.next();
      }

      // Run finished
      await this.finishRunning(candleSet as CandleSet);
    } catch (error) {
      await this.stop(Status.ERROR);
      throw error;
    }
  }

  /**
   * Step the trader with new candle
   *
   * @returns {Promise<void>}
   * @memberof Trader
   */
  public async step(candleSet: CandleSet): Promise<void> {
    try {
      if (this.status !== Status.RUNNING) {
        logger.error('Cannot STEP a trader not in RUNNING state (use initRunning())');
        return;
      }

      if (await this.checkTrader()) {
        // Fetch data
        const lastCandle = candleSet.getLast(this.symbol) as Candle;
        // Push indicators to bufferInputs (will write it to influx)
        if (this.saveInputs && Object.keys(lastCandle.indicators || {}).length > 0) {
          // TODO Write multiple INPUT serie (ETH,BTC, ETH15m, BTC15m, ...)
          // this.env.watchers.forEach ...
          this.bufferInputs.push({
            time: lastCandle.time,
            values: flatten(lastCandle.indicators),
          });
        }
        // Update portfolio with new candle
        this.portfolio.update(lastCandle);

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

        // Persist inputs/portfolio to influx
        await this.flushInputs();
        await this.portfolio.save();
      }
    } catch (error) {
      await this.stop(Status.ERROR);
      throw error;
    }
  }

  /**
   * Finish trader run properly
   *
   * @param {CandleSet} candleSet
   * @memberof Trader
   */
  public async finishRunning(candleSet: CandleSet) {
    // Strat finished
    if (this.strategy.afterAll) await this.strategy.afterAll(candleSet, this, this.config.stratOpts);
    // Stop trader (will flush buffers influx/mongo)
    await this.stop();
    this.portfolio.calcBacktestIndicators();
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
  private async checkTrader(): Promise<boolean> {
    const errorHandler = (error: any) => {
      throw error;
    };
    if (this.portfolio.indicators.currentProfit < -0.5) {
      logger.info(`[${this.config.name}] Stop trader too much damage (50% deficit)`);
      await this.stop().catch(errorHandler);
      return false;
    }
    return true;
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
    if (advice === 'buy' && this.portfolio.trade) {
      error = `[${this.config.name}] Trying to buy but there is already one order bought`;
    }
    if (advice === 'sell' && !this.portfolio.trade) {
      error = `[${this.config.name}] Trying to sell but there is no order to sell`;
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
      const exchangeInfo: Market = await this.exchange.getExchangeInfo(
        this.config.base,
        this.config.quote,
        this.config.env.backtest ? true : false
      );
      const minCost = exchangeInfo.limits.cost ? exchangeInfo.limits.cost.min : 0;
      if (this.portfolio.indicators.currentCapital < minCost) {
        logger.error(
          `[${this.config.name}] Capital not sufficient to buy in market (${this.symbol})` +
            `, currentCapital: ${this.config.capital}`
        );
        await this.stop();
      }
      const investExpected = this.portfolio.indicators.currentCapital * this.config.percentInvest;
      const invest = investExpected < minCost ? minCost : investExpected;
      const amount: number = +(invest / lastCandle.close).toFixed(8);
      const order: Order = await this.exchange.buyMarket(this.config.base, this.config.quote, amount, lastCandle);
      await this.portfolio.notifyBuy(order);
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
    if (this.portfolio.trade) {
      try {
        const order: Order = await this.exchange.sellMarket(
          this.config.base,
          this.config.quote,
          this.portfolio.trade.orderBuy.amount,
          lastCandle
        );
        await this.portfolio.notifySell(order);
      } catch (error) {
        logger.error(error);
        throw new Error(`[${this.config.name}] Problem while selling`);
      }
    }
  }

  /**
   * Save trader in MongoDB
   *
   * @memberof Trader
   */
  private async save(force = false): Promise<void> {
    if (this.persist && (force || Math.abs(moment().diff(this.lastPersistTime, 's')) > this.flushTimeout)) {
      try {
        const trader = { ...this.config, status: this.status };
        await TraderModel.findOneAndUpdate({ name: this.config.name }, trader, { upsert: true });
        await this.portfolio.persistMongo(true);
      } catch (error) {
        logger.error(error);
        logger.error(new Error(`[${this.config.name}] Error while saving trader ${this.config.name}`));
      }
      // Reset timeout (even if error)
      this.lastPersistTime = new Date().getTime();
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
    // If data to write and more than 5 second since last save (or force=true)
    if (
      this.bufferInputs.length > 0 &&
      (force ||
        this.bufferInputs.length >= INFLUX_BATCH_WRITE_SIZE ||
        Math.abs(moment().diff(this.lastBufferFlush, 's')) > this.flushTimeout)
    ) {
      try {
        await this.influx.writeData({ name: this.config.name }, this.bufferInputs, MEASUREMENT_INPUTS);
        this.bufferInputs = [];
      } catch (error) {
        logger.error(error);
        logger.error(
          new Error(`[${this.config.name}] Error while saving candles to measurement ${MEASUREMENT_INPUTS}`)
        );
      }
      // Reset timeout (even if error)
      this.lastBufferFlush = new Date().getTime();
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
