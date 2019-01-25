import { ema as emaTI } from 'technicalindicators';
import { Candle } from '_core/Env/Candle';
import { CandleIndicator } from 'indicators/CandleIndicator';
import { deepFind } from '../_core/helpers';

interface DiffConfig {
  period: number;
  key: string;
}

const diff: CandleIndicator = (label: string, opts: DiffConfig) => {
  // indicators static variables
  const scope = {};

  // Process function (called with each new candle)
  return async (candles: Candle[], newCandle: Candle) => {
    let val: number | undefined;
    if (candles.length >= opts.period) {
      const previous: number = deepFind(candles[candles.length - opts.period], opts.key);
      const current: number = deepFind(newCandle, opts.key);
      val = (current - previous) / previous;
    }
    return { [label]: val };
  };
};

export default diff;
