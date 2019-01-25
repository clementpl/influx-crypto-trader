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
  indicators?: {
    [key: string]: any;
  };
  [key: string]: any;
}
