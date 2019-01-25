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
    this.amount = parseInt(this.aggTime.slice(0, this.aggTime.length - 1), 10);
  }

  public push(newCandle: Candle) {
    // process candle
    // TODO => Use unit getMinutes/getHours/getDay...
    if (this.buffer.length === 0 || this.convertTime(newCandle.time) % this.amount === 0) {
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
    }
    // Remove
    if (this.buffer.length > this.bufferSize) {
      this.buffer.splice(0, 100);
    }
  }

  public getCandles() {
    return this.buffer;
  }

  private convertTime(time: number) {
    const date = new Date(time);
    switch (this.unit) {
      case 'h':
        return date.getHours();
      case 'd':
        return date.getDay();
      case 'm':
        return date.getMinutes();
      default:
        throw new Error(`Unknown unit ${this.unit}, choose between (m,h,d)`);
    }
  }
}
