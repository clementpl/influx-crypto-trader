import * as ccxt from 'ccxt';
import { Candle } from '../../Env/Candle';

export interface ExchangeConfig {
  name: string;
  test?: boolean;
  apiKey?: string;
  apiSecret?: string;
  fees?: number;
}

/**
 * Exchange class abstract the ccxt library and add a TEST mode (fake order)
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
    this.config.fees = this.config.fees || 0.001;
  }

  /**
   * Fetch exchange markets informations (fees, min/max amount invest)
   *
   * @param {string} base
   * @param {string} quote
   * @param {boolean} [fake=false]
   * @returns {Promise<ccxt.Market>}
   * @memberof Exchange
   */
  public async getExchangeInfo(base: string, quote: string, fake: boolean = false): Promise<ccxt.Market> {
    if (fake) {
      return {
        id: '',
        symbol: '',
        base: '',
        quote: '',
        active: true,
        precision: { amount: 0, price: 0, cost: 0 },
        limits: { amount: { min: 0, max: 0 }, price: { min: 0, max: 0 } },
        info: {},
      };
    }
    if (!this.marketsInfo) {
      const errorHandler = (error: Error) => {
        throw error;
      };
      // Load markets
      await this.exchange.loadMarkets().catch(errorHandler);
      this.marketsInfo = await this.exchange.fetchMarkets().catch(errorHandler);
    }
    const symbol = `${base}${quote}`;
    const markets = this.marketsInfo.filter(market => market.id === symbol);
    if (markets.length !== 1) throw new Error(`Market ${symbol} not found`);
    return markets[0];
  }

  /**
   * BuyMarket order
   * Follow ccxt.Order type definition
   *
   * @param {string} base
   * @param {string} quote
   * @param {number} amount
   * @param {Candle} lastCandle
   * @returns {Promise<ccxt.Order>}
   * @memberof Exchange
   */
  public async buyMarket(base: string, quote: string, amount: number, lastCandle: Candle): Promise<ccxt.Order> {
    if (this.config.test) {
      const cost: number = +(lastCandle.close * amount).toFixed(8);
      return {
        id: '1111111',
        info: {},
        timestamp: lastCandle.time,
        lastTradeTimestamp: lastCandle.time,
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
        fee: this.calculateFee('buy', base, quote, amount, cost),
        trades: [this.createTradeExecution('buy', base, quote, amount, lastCandle, cost)],
      };
    }

    try {
      const order: ccxt.Order = await this.exchange.createMarketBuyOrder(base + '/' + quote, amount);
      order.fee.cost = await this.convert(order.fee.cost, order.fee.currency, quote);
      order.fee.currency = quote;
      return order;
    } catch (error) {
      throw error;
    }
  }

  /**
   * SellMarket order
   * Follow ccxt.Order type definition
   *
   * @param {string} base
   * @param {string} quote
   * @param {number} amount
   * @param {Candle} lastCandle
   * @returns {Promise<ccxt.Order>}
   * @memberof Exchange
   */
  public async sellMarket(base: string, quote: string, amount: number, lastCandle: Candle): Promise<ccxt.Order> {
    if (this.config.test) {
      const cost: number = +(lastCandle.close * amount).toFixed(8);
      return {
        id: '1111111',
        info: {},
        timestamp: lastCandle.time,
        lastTradeTimestamp: lastCandle.time,
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
        fee: this.calculateFee('sell', base, quote, amount, cost),
        trades: [this.createTradeExecution('sell', base, quote, amount, lastCandle, cost)],
      };
    }

    try {
      const order: ccxt.Order = await this.exchange.createMarketSellOrder(base + '/' + quote, amount);
      order.fee.cost = await this.convert(order.fee.cost, order.fee.currency, quote);
      order.fee.currency = quote;
      return order;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Convert amount of source currency to target currency
   * Example: convert(1, 'BNB', 'USDT') = 30
   *
   * @param amount amount of source currency to convert to target
   * @param source currency of the amount (BNB)
   * @param target converting to target currency (USDT)
   */
  private async convert(amount: number, source: string, target: string): Promise<number> {
    if (source === target) return +amount.toFixed(8);
    try {
      const ticker = await this.exchange.fetchTicker(`${source}/${target}`);
      return +(amount * ticker.close!).toFixed(8);
    } catch (error) {
      throw error;
    }
  }

  /**
   * Calculate fees
   * Follow ccxt.Fee type definition
   *
   * @private
   * @param {string} side
   * @param {string} base
   * @param {string} quote
   * @param {number} amount
   * @param {Candle} lastCandle
   * @param {number} cost
   * @returns {ccxt.Fee}
   * @memberof Exchange
   */
  private calculateFee(side: string, base: string, quote: string, amount: number, cost: number): ccxt.Fee {
    const type = side === 'buy' ? 'maker' : 'taker';
    return {
      type, // Taker or maker (side)
      currency: quote, // which currency the fee is (usually quote)
      cost: +(this.config.fees! * cost).toFixed(8), // the fee amount in quote currency
      rate: this.config.fees!, // the fee rate (if available)
    };
    // TODO
    // Maybe use the ccxt function later (but onBuy return the cost in BTC and onSell in USDT)
    // Will be easier with every cost convert to the QUOTE currency
    // return this.exchange.calculateFee(base + '/' + quote, type, side, amount, lastCandle.close, type);
  }

  /**
   * Create a trade execution (one trade can be divide in multiple trade/order Execution)
   * Follow ccxt.Trade type definition
   *
   * @private
   * @param {string} side
   * @param {string} base
   * @param {string} quote
   * @param {number} amount
   * @param {Candle} lastCandle
   * @param {number} cost
   * @returns {ccxt.Trade}
   * @memberof Exchange
   */
  private createTradeExecution(
    side: string,
    base: string,
    quote: string,
    amount: number,
    lastCandle: Candle,
    cost: number
  ): ccxt.Trade {
    return {
      amount, // amount of base currency
      datetime: new Date(lastCandle.time).toISOString(), // ISO8601 datetime with milliseconds;
      id: '1111', // string trade id
      info: {}, // the original decoded JSON as is
      // order?: ;                  // string order id or undefined/None/null
      price: lastCandle.close, // float price in quote currency
      timestamp: lastCandle.time, // Unix timestamp in milliseconds
      type: 'market', // order type, 'market', 'limit' or undefined/None/null
      side: <any>side, // direction of the trade, 'buy' or 'sell'
      symbol: base + '/' + quote, // symbol in CCXT format
      takerOrMaker: side === 'buy' ? 'maker' : 'taker', // string, 'taker' or 'maker'
      cost, // total cost (including fees), `price * amount`
      fee: this.calculateFee(side, base, quote, amount, cost),
    };
  }
}
