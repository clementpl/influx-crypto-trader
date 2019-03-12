import { OHLCV } from '../Influx/Influx';
import { requireUncached } from '../helpers';
import { Candle } from './Candle';
import { CandlesAgg } from './CandlesAgg';

export interface CandleSetConfig {
  bufferSize: number;
  indicators: Array<{ label: string; opts: { [name: string]: string } }>;
  aggTimes: string[]; // '1m', ...
}

export type CandleSetPlugin = (candles: Candle[], newCandle: Candle) => Promise<{ [name: string]: any }>;

/**
 * CandleSet class manage multiple set of Candles (one per market)
 * Handle the calculation of indicators (plugins)
 *
 * @export
 * @class CandleSet
 */
export class CandleSet {
  public marketCandles: Map<string, Candle[] | CandlesAgg> = new Map();
  private plugins: Array<{ opts: any; compute: CandleSetPlugin }> = []; // indicators plugins

  /**
   * Creates an instance of CandleSet.
   * @memberof CandleSet
   */
  constructor(public config: CandleSetConfig) {
    // Attach plugins
    this.plugins = config.indicators.map(({ label, opts }) => ({
      opts,
      compute: requireUncached(`${__dirname}/../../indicators/${opts.name}`).default(label, opts),
    }));
  }

  public forEachMarket(callback: (candles: Candle[], symbol: string) => void) {
    this.marketCandles.forEach(callback);
  }

  /**
   * Push new candle
   *
   * @param {any} candles Can be a single candle or an array of candle
   * @memberof CandleSet
   */
  public async push(candles: OHLCV | OHLCV[], symbol: string): Promise<void> {
    if (!(candles instanceof Array)) {
      candles = [candles];
    }
    const candlesSymbol = this.getMarketCandles(symbol) as Candle[];
    candles = this.removeDuplicates(candles, symbol);
    for (const candle of candles) {
      // Push to CandlesAgg configurated
      this.config.aggTimes.forEach(aggTime => {
        const candleAgg = this.getMarketCandles(`${symbol}:${aggTime}`, aggTime) as CandlesAgg;
        candleAgg.push(candle);
      });
      const newCandle = await this.calcCandle(symbol, candle);
      candlesSymbol.push(newCandle);
      // Set correct indicators
      this.config.aggTimes.forEach(aggTime => {
        const candleAgg = this.getMarketCandles(`${symbol}:${aggTime}`, aggTime) as CandlesAgg;
        candleAgg.getLast().indicators = newCandle.indicators;
      });
    }
    if (candlesSymbol.length > this.config.bufferSize) {
      candlesSymbol.splice(0, candlesSymbol.length - this.config.bufferSize);
    }
  }

  /**
   * Pop a candle
   *
   * @returns
   * @memberof CandleSet
   */
  public pop(symbol: string): Candle | undefined {
    const candlesSymbol = this.getMarketCandles(symbol) as Candle[];
    return candlesSymbol.pop();
  }

  /**
   * Get all candles
   *
   * @returns {Array < Candle >}
   * @memberof CandleSet
   */
  public get(symbol: string): Candle[] {
    return this.getMarketCandles(symbol) as Candle[];
  }

  /**
   * Get last $nb candles
   *
   * @param {number} nb number of last candle to retrieve
   * @returns {Array < Candle >}
   * @memberof CandleSet
   */
  public getLast(symbol: string, nb: number = 1): Candle | Candle[] {
    const candlesSymbol = this.getMarketCandles(symbol) as Candle[];
    return nb === 1 ? candlesSymbol[candlesSymbol.length - 1] : candlesSymbol.slice(-1 * nb);
  }

  /**
   * Helper to get set of candle for the given symbol (guard initialisation)
   *
   * @private
   * @param {string} symbol
   * @param {boolean} [agg] should return CandleAgg
   * @returns
   * @memberof CandleSet
   */
  public getMarketCandles(symbol: string, agg?: string): Candle[] | CandlesAgg {
    if (!this.marketCandles.get(symbol)) {
      // tags: ['binance', 'BTC', 'USDT', '15m'?]
      const tags = symbol.split(':');
      this.marketCandles.set(symbol, tags.length === 4 ? new CandlesAgg(tags[3], this.config.bufferSize) : []);
    }
    const candles = this.marketCandles.get(symbol) as CandlesAgg | Candle[];
    if (agg) return candles as CandlesAgg;
    if (candles instanceof CandlesAgg) return candles.getCandles();
    return candles;
  }

  /**
   * Take care of keeping on last data update (if a given candle already exists in the set, it will be replaced)
   *
   * @private
   * @param {Candle[]} candles
   * @param {string} symbol
   * @returns {Candle[]}
   * @memberof CandleSet
   */
  private removeDuplicates(candles: Candle[], symbol: string): Candle[] {
    const candlesSymbol = this.getMarketCandles(symbol) as Candle[];
    // If only new candles given (nothing to remove)
    if (candlesSymbol.length === 0 || candles[0].time > candlesSymbol[candlesSymbol.length - 1].time) return candles;
    for (let i = candles.length - 1; i >= 0; i--) {
      if (candles[i].time === candlesSymbol[candlesSymbol.length - 1].time) {
        candlesSymbol.pop();
      }
    }
    return candles;
  }

  /**
   * Calculate indicators for the given candle
   *
   * @param {Candle} candle base candle which will be use to calculate new indicators
   * @returns {Candle}
   * @memberof CandleSet
   */
  private async calcCandle(symbol: string, candle: Candle): Promise<Candle> {
    // If close is a little number (0.0000153) convert in satoshi (multiply by 1 000 000 00)
    // Enable correct indicator calculation
    // const scaler = candle.close < 0.0002 ? 100000000 : 1;
    // const closes = candlesSymbol
    // .slice(-100)
    // .map(c => c.close * scaler)
    // .concat(+candle.close * scaler);

    const candlesSymbol = this.getMarketCandles(symbol) as Candle[];

    const newCandle: Candle = {
      time: +candle.time,
      open: +candle.open,
      high: +candle.high,
      low: +candle.low,
      close: +candle.close,
      volume: +candle.volume,
      indicators: {},
    };

    // Execute plugins
    for (const { opts, compute } of this.plugins) {
      if (opts.aggTime) {
        const candles = this.getMarketCandles(`${symbol}:${opts.aggTime}`) as Candle[];
        // const lastCandleAgg = candles.slice(-1)[0];
        // Maybe make a ref
        newCandle.indicators = {
          ...newCandle.indicators,
          ...(await compute(candles.slice(0, candles.length - 1), candles.slice(-1)[0])),
        };
      } else {
        const candles = opts.aggTime ? (this.getMarketCandles(`${symbol}:${opts.aggTime}`) as Candle[]) : candlesSymbol;
        newCandle.indicators = {
          ...newCandle.indicators,
          ...(await compute(candles, newCandle)),
        };
      }
      /*const candles = opts.aggTime ? (this.getMarketCandles(`${symbol}:${opts.aggTime}`) as Candle[]) : candlesSymbol;
      newCandle.indicators = {
        ...newCandle.indicators,
        ...(await compute(candles, newCandle)),
      };*/
    }

    return newCandle;
  }
}
