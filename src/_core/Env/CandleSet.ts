import { OHLCV } from '../Influx/Influx';

/**
 * Candle interface, represent a candlestick
 *
 * @export
 * @interface Candle
 */
export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  indicators?: any;
  [key: string]: any;
}

export interface CandleSetConfig {
  bufferSize: number;
  indicators: Array<{ label: string; opts: { [name: string]: string } }>;
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
  public marketCandles: Map<string, Candle[]> = new Map();
  private plugins: CandleSetPlugin[] = []; // indicators plugins

  /**
   * Creates an instance of CandleSet.
   * @memberof CandleSet
   */
  constructor(public config: CandleSetConfig) {
    // Attach plugins
    this.plugins = config.indicators.map(({ label, opts }) =>
      require(`../../indicators/${opts.name}`).default(label, opts)
    );
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
    const candlesSymbol = this.getMarketCandles(symbol);
    candles = this.removeDuplicates(candles, symbol);
    for (const candle of candles) {
      candlesSymbol.push(await this.calcCandle(symbol, candle));
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
    const candlesSymbol = this.getMarketCandles(symbol);
    return candlesSymbol.pop();
  }

  /**
   * Get all candles
   *
   * @returns {Array < Candle >}
   * @memberof CandleSet
   */
  public get(symbol: string): Candle[] {
    return this.getMarketCandles(symbol);
  }

  /**
   * Get last $nb candles
   *
   * @param {number} nb number of last candle to retrieve
   * @returns {Array < Candle >}
   * @memberof CandleSet
   */
  public getLast(symbol: string, nb: number = 1): Candle | Candle[] {
    const candlesSymbol = this.getMarketCandles(symbol);
    return nb === 1 ? candlesSymbol[candlesSymbol.length - 1] : candlesSymbol.slice(-1 * nb);
  }

  /**
   * Helper to get set of candle for the given symbol (guard initialisation)
   *
   * @private
   * @param {string} symbol
   * @returns
   * @memberof CandleSet
   */
  private getMarketCandles(symbol: string): Candle[] {
    if (!this.marketCandles.get(symbol)) {
      this.marketCandles.set(symbol, []);
    }
    return <Candle[]>this.marketCandles.get(symbol);
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
    const candlesSymbol = this.getMarketCandles(symbol);
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

    const candlesSymbol = this.getMarketCandles(symbol);

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
    for (const plugin of this.plugins) {
      newCandle.indicators = {
        ...newCandle.indicators,
        ...(await plugin(candlesSymbol, newCandle)),
      };
    }

    return newCandle;
  }
}
