import * as ccxt from 'ccxt';
import { Candle } from '../../Env/Candle';

export interface ExchangeConfig {
  name: string;
  test?: boolean;
  apiKey?: string;
  apiSecret?: string;
  fees?: number;
}
/*
export interface Order {
  market: string; // 'BNBETH'
  orderId: string; // 4480553
  transactTime: number; //1509049376261,
  price: number; //'0.00000000',
  origQty: number; //'1.00000000',
  exeutedQty: number; //'1.00000000',
  status: string; //'FILLED',
  type: string; //'MARKET',
  side: string; //'BUY'
}
*/
/**
 * Exchange interface
 *
 * @export
 * @interface Exchange
 */
export class Exchange {
  public exchange: ccxt.Exchange;
  private marketsInfo: ccxt.Market[];

  constructor(public config: ExchangeConfig) {
    this.exchange = new (<any>ccxt)[this.config.name]({
      apiKey: this.config.apiKey || '',
      secret: this.config.apiSecret || '',
      timeout: 30000,
      enableRateLimit: true,
    });
    this.config.fees = this.config.fees || 0.002;
  }

  public async getExchangeInfo(base: string, quote: string): Promise<ccxt.Market> {
    if (!this.marketsInfo) {
      this.marketsInfo = await this.exchange.fetchMarkets().catch(error => {
        throw error;
      });
    }
    const symbol = `${base}${quote}`;
    const markets = this.marketsInfo.filter(market => market.id === symbol);
    if (markets.length !== 1) throw new Error(`Market ${symbol} not found`);
    return markets[0];
  }

  public async buyMarket(base: string, quote: string, amount: number, lastCandle: Candle): Promise<ccxt.Order> {
    if (this.config.test) {
      const cost: number = +(lastCandle.close * amount).toFixed(8);
      const fee: number = <number>this.config.fees;
      // Recalculate amount substracting fees
      // amount = +(amount - amount * fee).toFixed(8);
      return {
        id: '1111111',
        info: {},
        timestamp: lastCandle.time,
        datetime: new Date(lastCandle.time).toISOString(),
        status: 'closed',
        symbol: base + '/' + quote,
        type: 'market',
        side: 'buy',
        price: lastCandle.close,
        cost,
        amount,
        filled: amount,
        remaining: 0,
        fee: +(fee * cost).toFixed(8),
      };
    }
    // tslint:disable-next-line
    return await this.exchange
      .createMarketBuyOrder(base + '/' + quote, amount, { test: this.config.test })
      .catch((error: any) => {
        throw error;
      });
  }

  public async sellMarket(base: string, quote: string, amount: number, lastCandle: Candle): Promise<ccxt.Order> {
    if (this.config.test) {
      const cost: number = +(lastCandle.close * amount).toFixed(8);
      const fee: number = <number>this.config.fees;
      return {
        id: '1111111',
        info: {},
        timestamp: lastCandle.time,
        datetime: new Date(lastCandle.time).toISOString(),
        status: 'closed',
        symbol: base + '/' + quote,
        type: 'market',
        side: 'sell',
        price: lastCandle.close,
        cost,
        amount,
        filled: amount,
        remaining: 0,
        fee: +(fee * cost).toFixed(8), // TODO ADD FEE
      };
    }
    // tslint:disable-next-line
    return await this.exchange
      .createMarketSellOrder(base + '/' + quote, amount, { test: this.config.test })
      .catch((error: any) => {
        throw error;
      });
  }
}
