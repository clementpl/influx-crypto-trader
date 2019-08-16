import { Candle } from './Candle';

/**
 * Candle array with aggregated OHLC
 *
 * @export
 * @class CandlesAgg
 */
export class CandlesAgg {
  private buffer: Candle[] = [];
  private unit: string;
  private amount: number;

  /**
   * Creates an instance of CandlesAgg.
   * @param {string} aggTime aggregation time '1m', ..., '30m', ...., '1h', ..., '12h', ..., '1d'...
   * @memberof CandlesAgg
   */
  constructor(public aggTime: string, private bufferSize: number = 5000) {
    this.unit = this.aggTime.slice(-1)[0];
    this.amount = +this.aggTime.slice(0, this.aggTime.length - 1);
  }

  public push(newCandle: Candle) {
    // process candle
    if (
      this.buffer.length === 0 ||
      (this.convertTime(newCandle.time) % this.amount === 0 &&
        this.buffer[this.buffer.length - 1].time !== newCandle.time)
    ) {
      this.buffer.push(newCandle);
    }
    // Update candle
    else {
      const lastCandle = this.buffer[this.buffer.length - 1];
      // Sum volume
      lastCandle.volume += newCandle.volume;
      // Update close, low, high
      lastCandle.close = newCandle.close;
      if (newCandle.low < lastCandle.low) lastCandle.low = newCandle.low;
      if (newCandle.high > lastCandle.high) lastCandle.high = newCandle.high;
      lastCandle.indicators = newCandle.indicators;
    }
    // Remove
    if (this.buffer.length > this.bufferSize) {
      this.buffer.splice(0, 100);
    }
  }

  public getCandles() {
    return this.buffer;
  }

  public getLast() {
    return this.buffer[this.buffer.length - 1];
  }

  private convertTime(time: number) {
    const date = new Date(time);
    switch (this.unit) {
      case 'm':
        return date.getMinutes();
      case 'h':
        return date.getHours() + (date.getMinutes() !== 0 ? 0.1 : 0);
      case 'd':
        return date.getDate() + (date.getHours() !== 0 || date.getMinutes() !== 0 ? 0.1 : 0);
      default:
        throw new Error(`Unknown unit ${this.unit}, choose between (m,h,d)`);
    }
  }
}
