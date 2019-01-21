import * as moment from 'moment';
import { Order } from 'ccxt';
import { config } from '../../../../config/config';
import { Influx } from '../../Influx/Influx';
import { Candle } from '../../Env/CandleSet';
import { logger } from '../../../logger';
import { MEASUREMENT_PORTFOLIO, MEASUREMENT_TRADES } from '../../Influx/constants';
import { tagsToString } from '../../Influx/helpers';

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
   *  - STRAMING => will flush every minutes "normal behavior"
   */
  private flushTimeout = 5;
  private lastFlushTime: number = new Date().getTime();
  private updateBuffer: any[] = [];
  private buyBuffer: any[] = [];
  private sellBuffer: any[] = [];
  private hasInitSeries: boolean;

  constructor(public conf: PortfolioConfig) {}

  public async init(influx: Influx): Promise<void> {
    this.influx = influx;
    await this.cleanInflux();
    this.hasInitSeries = false;
    this.reset();
  }

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

  public async cleanInflux(): Promise<void> {
    const tags = { name: this.conf.name };
    await this.influx.dropSerie(MEASUREMENT_PORTFOLIO, tags);
    await this.influx.dropSerie(MEASUREMENT_TRADES, tags);
  }

  public notifyBuy(order: Order): void {
    this.indicators.currentCapital -= order.cost + order.fee;
    this.indicators.assetCapital += order.filled;
    this.indicators.fees += order.fee;
    this.buyBuffer.push({
      time: order.timestamp,
      values: {
        price: order.price,
        cost: order.cost,
        fee: order.fee,
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

  public notifySell(order: Order): void {
    this.indicators.currentCapital += order.cost - order.fee;
    this.indicators.assetCapital -= order.filled;
    this.indicators.fees += order.fee;
    this.sellBuffer.push({
      time: order.timestamp,
      values: {
        price: order.price,
        cost: order.cost,
        fee: order.fee,
        amount: order.amount,
      },
    });
    (<any>this.trade).orderSell = order;
    this.tradeHistory.pop();
    this.pushTrade();
    this.trade = undefined;
  }

  public update(lastCandle: Candle): void {
    this.indicators.totalValue = this.indicators.currentCapital + this.indicators.assetCapital * lastCandle.close;
    this.indicators.currentProfit = (this.indicators.totalValue - this.conf.capital) / this.conf.capital;
    if (this.trade) {
      this.trade.orderProfit = (lastCandle.close - this.trade.orderBuy.price) / this.trade.orderBuy.price;
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

  public async save(lastCandle: Candle): Promise<void> {
    this.update(lastCandle);
    // Copy indicator
    const indicator: PortfolioIndicators = JSON.parse(JSON.stringify(this.indicators));
    this.pushIndicator(indicator);
    this.updateBuffer.push({ values: indicator, time: lastCandle.time });
    await this.flush();
  }

  public async flush(force: boolean = false): Promise<void> {
    // If lastFlushTime > flushTimeout flush buffer
    // - Backtest every 5 second
    // - Streaming every minutes "normal behavior"
    if (force || moment().diff(moment(this.lastFlushTime), 's') >= this.flushTimeout) {
      const catchHelper = (error: Error) => {
        logger.error(error);
        throw new Error('Problem while saving portfolio state to influx');
      };
      // Write async (update/buy/sell)
      const tags = { name: this.conf.name };
      await this.influx.writeData(tags, this.updateBuffer, MEASUREMENT_PORTFOLIO).catch(catchHelper);
      await this.influx.writeData({ ...tags, side: 'buy' }, this.buyBuffer, MEASUREMENT_TRADES).catch(catchHelper);
      await this.influx.writeData({ ...tags, side: 'sell' }, this.sellBuffer, MEASUREMENT_TRADES).catch(catchHelper);
      this.lastFlushTime = new Date().getTime();
      this.updateBuffer = [];
      this.buyBuffer = [];
      this.sellBuffer = [];
    }
  }

  private pushIndicator(indicators: PortfolioIndicators): void {
    this.indicatorHistory.push(indicators);
    if (this.indicatorHistory.length > this.bufferSize) {
      this.indicatorHistory.splice(0, this.indicatorHistory.length - this.bufferSize);
    }
  }

  private pushTrade(): void {
    const trade = JSON.parse(JSON.stringify(this.trade));
    this.tradeHistory.push(trade);
    if (this.tradeHistory.length > this.bufferSize) {
      this.tradeHistory.splice(0, this.tradeHistory.length - this.bufferSize);
    }
  }
}
