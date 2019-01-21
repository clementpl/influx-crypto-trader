import {
  MACD as IndMACD,
  RSI as IndRSI,
  BollingerBands,
  hasDoubleBottom,
  hasDoubleTop,
  hasHeadAndShoulder,
  hasInverseHeadAndShoulder,
  isTrendingDown,
  isTrendingUp,
} from 'technicalindicators';
import { OHLCV } from '../Influx/Influx';
import { copyObj } from '../../helpers';

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

/**
 * CandleSet class manage a set of Candle
 * handle the calculation of indicators
 *
 * @export
 * @class CandleSet
 */
export class CandleSet {
  public marketCandles: Map<string, Candle[]> = new Map();
  public aggCandles: Map<string, Candle[]> = new Map();
  private aggTime: string = '15m';
  private amount: number;
  private unit: string;

  /**
   * Creates an instance of CandleSet.
   * @memberof CandleSet
   */
  constructor(private bufferSize: number) {
    this.unit = this.aggTime[this.aggTime.length - 1];
    this.amount = +this.aggTime.slice(0, -1);
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
    this.pushAggregate(candles, symbol);
    const candlesSymbol = this.getMarketCandles(symbol);
    candles = this.removeDuplicates(candles, symbol);
    for (const candle of candles) {
      candlesSymbol.push(await this.calcCandle(symbol, candle));
    }
    if (candlesSymbol.length > this.bufferSize) {
      candlesSymbol.splice(0, candlesSymbol.length - this.bufferSize);
    }
  }

  public pushAggregate(candles: OHLCV[], symbol: string) {
    const bufferCandles = this.getAggCandles(symbol);
    for (const candle of candles) {
      // TODO => Use unit getMinutes/getHours/getDay...
      if (bufferCandles.length === 0 || new Date(candle.time).getMinutes() % this.amount === 1) {
        bufferCandles.push(candle as Candle);
      } else {
        const lastCandle = bufferCandles[bufferCandles.length - 1];
        // Sum volume
        lastCandle.volume += candle.volume;
        // Update close, low, high
        lastCandle.close = candle.close;
        if (candle.low < lastCandle.low) lastCandle.low = candle.low;
        if (candle.high > lastCandle.high) lastCandle.high = candle.high;
      }
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
  public getAggCandles(symbol: string): Candle[] {
    if (!this.aggCandles.get(symbol)) {
      this.aggCandles.set(symbol, []);
    }
    return <Candle[]>this.aggCandles.get(symbol);
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
    const candlesSymbol = this.getMarketCandles(symbol);
    const candlesAgg = this.getAggCandles(symbol);
    /* Caculate indicators ...*/
    // If close is a little number (0.0000153) convert in satoshi (multiply by 1 000 000 00)
    // Enable correct indicator calculation
    const scaler = candle.close < 0.0002 ? 100000000 : 1;
    // const closes = candlesSymbol
    const closes = candlesAgg
      .slice(-100)
      .map(c => c.close * scaler)
      .concat(+candle.close * scaler);
    /* Caculate indicators ...*/
    const MACD: any = this.calcMACD(closes);
    const BB: any = this.calcBollingerBands(closes);
    const RSI: number = this.calcRSI(closes);
    /* Pattern recognition (TO LONG !!!) */
    /*const hs: Boolean = closes.length >= 400 ? await hasHeadAndShoulder({ values: closes }) : undefined;
		const ihs: Boolean = closes.length >= 400 ? await hasInverseHeadAndShoulder({ values: closes }) : undefined;
		const db: Boolean = closes.length >= 400 ? await hasDoubleBottom({ values: closes }) : undefined;
		const dt: Boolean = closes.length >= 400 ? await hasDoubleTop({ values: closes }) : undefined;*/
    // const tu: Boolean | undefined = closes.length >= 300 ? await isTrendingUp({ values: closes }) : undefined;
    // const td: Boolean | undefined = closes.length >= 300 ? await isTrendingDown({ values: closes }) : undefined;

    return {
      time: +candle.time,
      open: +candle.open,
      high: +candle.high,
      low: +candle.low,
      close: +candle.close,
      volume: +candle.volume,
      indicators: {
        CloseVar15m: this.getVariation(candlesSymbol, 'close', 15),
        // CloseVar1h: this.getVariation(candlesSymbol, 'close', 60),
        CloseVar4h: this.getVariation(candlesSymbol, 'close', 60 * 4),
        sumVolume15m: this.sumField(candlesSymbol, 'volume', 15),
        sumVolume4h: this.sumField(candlesSymbol, 'volume', 60 * 4),
        RSI,
        MACD,
        BB,
        // trendingUp: tu,
        // trendingDown: td,
        /*
          headAndShoulder: hs,
				  inverseHeadAndShoulder: ihs,
				  doubleBottom: db,
				  doubleTop: dt,
        */
      },
    };
  }

  /**
   * Calculate variation for the given key on the specified window
   *
   * @private
   * @param {Candle[]} candles
   * @param {string} key
   * @param {number} window
   * @returns {number}
   * @memberof CandleSet
   */
  private getVariation(candles: Candle[], key: string, window: number): number | undefined {
    if (candles.length - 1 - window < 0) return undefined;
    const curr = +candles[candles.length - 1][key];
    const prev = +candles[candles.length - 1 - window][key];
    return +((curr - prev) / prev).toFixed(8);
  }

  /**
   * Sum a field over a window
   *
   * @private
   * @param {Candle[]} candles
   * @param {string} key
   * @param {number} window
   * @returns {(number | undefined)}
   * @memberof CandleSet
   */
  private sumField(candles: Candle[], key: string, window: number): number | undefined {
    if (candles.length - 1 - window < 0) return undefined;
    let sum = 0;
    for (let i = candles.length - 1 - window; i < candles.length; i++) {
      const candle = candles[i];
      sum = +candle[key];
    }
    return sum;
  }

  /**
   * Calculate MACD (Moving Average ...) indicator
   *
   * @param {number[]} closes
   * @returns {any}
   * @memberof CandleSet
   */
  private calcMACD(closes: number[]): any {
    const results = IndMACD.calculate({
      values: closes,
      fastPeriod: 12,
      slowPeriod: 26,
      signalPeriod: 9,
      SimpleMAOscillator: false,
      SimpleMASignal: false,
    });
    return results[results.length - 1];
  }

  /**
   * Calculate RSI (relative strength index) indicator
   *
   * @param {number[]} closes
   * @returns {number}
   * @memberof CandleSet
   */
  private calcRSI(closes: number[]): number {
    const results = IndRSI.calculate({
      values: closes,
      period: 14,
    });
    return results[results.length - 1];
  }

  /**
   * Calculate Bolinder Band indicator
   *
   * @param {number[]} closes
   * @returns {any}
   * @memberof CandleSet
   */
  private calcBollingerBands(closes: number[]): any {
    const results = BollingerBands.calculate({
      values: closes,
      period: 21,
      stdDev: 2,
    });
    return results[results.length - 1];
  }
}
