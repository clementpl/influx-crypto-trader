import * as moment from 'moment';
import { Order } from 'ccxt';
import { Influx } from '../../Influx/Influx';
import { Candle } from '../../Env/Candle';
import { logger } from '../../../logger';
import { MEASUREMENT_PORTFOLIO, MEASUREMENT_TRADES } from '../../Influx/constants';
import { PortfolioModel } from './model';

export interface PortfolioConfig {
  name: string;
  capital: number;
  base: string;
  quote: string;
  exchange: string;
  backtest: boolean;
}

export interface PortfolioIndicators {
  currentCapital: number;
  assetCapital: number;
  totalValue: number;
  fees: number;
  currentProfit: number;
}

export interface PortfolioTrade {
  orderBuy: Order;
  orderSell: Order | undefined;
  orderProfit: number;
}

/**
 * Portfolio class help to track and calculate statistic about different metrics (buy/sell/profit/...)
 *
 * @export
 * @class Portfolio
 */
export class Portfolio {
  public indicators: PortfolioIndicators;
  public trade: PortfolioTrade | undefined;
  public indicatorHistory: PortfolioIndicators[] = [];
  public tradeHistory: PortfolioTrade[] = [];
  // Buffer size of history (indicator/trades)
  private bufferSize: number = 2000;
  // InfluxDb client
  private influx: Influx;
  /**
   * Flush (Help to write data to influxDB efficiently in backtest mode)
   *  - BACKTEST => will flush data to influxDB every 5 secondes
   *  - STREAMING => will flush every minutes "normal behavior"
   */
  private flushTimeout = 10;
  private lastFlushTime: number = new Date().getTime();
  private updateBuffer: any[] = [];
  private buyBuffer: any[] = [];
  private sellBuffer: any[] = [];
  private hasInitSeries: boolean;

  constructor(public conf: PortfolioConfig) {}

  /**
   * Init the portfolio
   *
   * @param {Influx} influx
   * @returns {Promise<void>}
   * @memberof Portfolio
   */
  public async init(influx: Influx, flush: boolean = true): Promise<void> {
    this.influx = influx;
    if (flush) await this.cleanInflux();
    this.hasInitSeries = false;
    this.reset();
  }

  /**
   * Reset portfolio
   *
   * @memberof Portfolio
   */
  public reset(): void {
    this.indicators = {
      currentCapital: this.conf.capital,
      totalValue: this.conf.capital,
      assetCapital: 0,
      fees: 0,
      currentProfit: 0,
    };
    this.indicatorHistory = [];
    this.trade = undefined;
    this.tradeHistory = [];
  }

  /**
   * Clean influx db data
   *
   * @returns {Promise<void>}
   * @memberof Portfolio
   */
  public async cleanInflux(): Promise<void> {
    const tags = { name: this.conf.name };
    await this.influx.dropSerie(MEASUREMENT_PORTFOLIO, tags);
    await this.influx.dropSerie(MEASUREMENT_TRADES, tags);
  }

  /**
   * Notify portfolio for a new buy order
   *
   * @param {Order} order
   * @memberof Portfolio
   */
  public notifyBuy(order: Order): void {
    // on Buy currentCapital decrease by the cost (fees cost is include in it so no need to add it again)
    this.indicators.currentCapital -= order.cost /* + order.fee.cost*/;
    this.indicators.assetCapital += order.filled;
    this.indicators.fees += order.fee.cost;
    this.buyBuffer.push({
      time: order.timestamp,
      values: {
        price: order.price,
        cost: order.cost,
        fee: order.fee.cost,
        amount: order.amount,
      },
    });
    this.trade = {
      orderBuy: order,
      orderSell: undefined,
      orderProfit: 0,
    };
    this.pushTrade();
  }

  /**
   * Notify portfolio for a new sell order
   *
   * @param {Order} order
   * @memberof Portfolio
   */
  public notifySell(order: Order): void {
    this.indicators.currentCapital += order.cost - order.fee.cost;
    this.indicators.assetCapital -= order.filled;
    this.indicators.fees += order.fee.cost;
    this.sellBuffer.push({
      time: order.timestamp,
      values: {
        price: order.price,
        cost: order.cost,
        fee: order.fee.cost,
        amount: order.amount,
      },
    });
    // Update trade sell order and refresh tradeHistory with new sell order
    this.trade!.orderSell = order;
    // Profit % => (SellPrice - BuyPrice (-fees)) / BuyPrice
    this.trade!.orderProfit =
      (order.cost - this.trade!.orderBuy.cost - (this.trade!.orderBuy.fee.cost + order.fee.cost)) /
      this.trade!.orderBuy.cost;
    this.tradeHistory.pop();
    this.pushTrade();
    this.trade = undefined;
  }

  /**
   * Update portofolio statistics with new candle
   *
   * @param {Candle} lastCandle
   * @memberof Portfolio
   */
  public update(lastCandle: Candle): void {
    this.indicators.totalValue = this.indicators.currentCapital + this.indicators.assetCapital * lastCandle.close;
    this.indicators.currentProfit = (this.indicators.totalValue - this.conf.capital) / this.conf.capital;
    if (this.trade) {
      // this.trade.orderProfit = (lastCandle.close - this.trade.orderBuy.price) / this.trade.orderBuy.price;
      this.trade.orderProfit =
        (lastCandle.close * this.trade.orderBuy.filled - this.trade.orderBuy.cost - this.trade.orderBuy.fee.cost) /
        this.trade.orderBuy.cost;
    }
    // If first call to Update (init buffer serie)
    if (!this.hasInitSeries) {
      // Copy indicator
      const indicator = JSON.parse(JSON.stringify(this.indicators));
      this.pushIndicator(indicator);
      this.updateBuffer.push({ values: indicator, time: lastCandle.time });
      this.hasInitSeries = true;
    }
  }

  /**
   * Save portfolio data to influx
   *
   * @param {Candle} lastCandle
   * @returns {Promise<void>}
   * @memberof Portfolio
   */
  public async save(lastCandle: Candle): Promise<void> {
    this.update(lastCandle);
    // Copy indicator
    const indicator: PortfolioIndicators = JSON.parse(JSON.stringify(this.indicators));
    this.pushIndicator(indicator);
    this.updateBuffer.push({ values: indicator, time: lastCandle.time });
    await this.flush();
    await this.persistMongo();
  }

  /**
   * Persist portfolio data to MongoDB
   *
   * @memberof Portfolio
   */
  public async persistMongo() {
    try {
      if (!this.conf.backtest) {
        const portfolio = {
          ...this.conf,
          indicators: this.indicators,
          trade: this.trade,
          indicatorHistory: this.indicatorHistory,
          tradeHistory: this.tradeHistory,
        };
        await PortfolioModel.findOneAndUpdate({ name: this.conf.name }, portfolio, { upsert: true });
      }
    } catch (error) {
      logger.error(error);
      logger.error(new Error(`[${this.conf.name}] Error while saving portfolio ${this.conf.name}`));
    }
  }

  /**
   * Flush data to influxDB
   *
   * @param {boolean} [force=false]
   * @returns {Promise<void>}
   * @memberof Portfolio
   */
  public async flush(force: boolean = false): Promise<void> {
    // If lastFlushTime > flushTimeout flush buffer
    // - Backtest every 5 second
    // - Streaming every minutes "normal behavior"
    if (force || moment().diff(moment(this.lastFlushTime), 's') >= this.flushTimeout) {
      // Write async (update/buy/sell)
      const tags = { name: this.conf.name };
      try {
        await this.influx.writeData(tags, this.updateBuffer, MEASUREMENT_PORTFOLIO);
        await this.influx.writeData({ ...tags, side: 'buy' }, this.buyBuffer, MEASUREMENT_TRADES);
        await this.influx.writeData({ ...tags, side: 'sell' }, this.sellBuffer, MEASUREMENT_TRADES);
        this.updateBuffer = [];
        this.buyBuffer = [];
        this.sellBuffer = [];
      } catch (error) {
        logger.error(error);
        logger.error(new Error(`[${this.conf.name}] Problem while saving portfolio state to influx`));
        // throw new Error('Problem while saving portfolio state to influx');
      }
      // reset flush time (even if error, will try to flush again later)
      this.lastFlushTime = new Date().getTime();
    }
  }

  /**
   * Helper push an indicator
   *
   * @private
   * @param {PortfolioIndicators} indicators
   * @memberof Portfolio
   */
  private pushIndicator(indicators: PortfolioIndicators): void {
    this.indicatorHistory.push(indicators);
    if (this.indicatorHistory.length > this.bufferSize) {
      this.indicatorHistory.splice(0, this.indicatorHistory.length - this.bufferSize);
    }
  }

  /**
   * Helper push the current trade in history
   *
   * @private
   * @memberof Portfolio
   */
  private pushTrade(): void {
    const trade = JSON.parse(JSON.stringify(this.trade));
    this.tradeHistory.push(trade);
    if (this.tradeHistory.length > this.bufferSize) {
      this.tradeHistory.splice(0, this.tradeHistory.length - this.bufferSize);
    }
  }
}
