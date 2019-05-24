import { wma as wmaTI } from 'technicalindicators';
import { Candle } from '@core/Env/Candle';
import { CandleIndicator } from './CandleIndicator';

interface WMAConfig {
  period: number;
  key: string;
}

const wma: CandleIndicator = (label: string, opts: WMAConfig) => {
  // indicators static variables
  const scope = {};

  // Process function (called with each new candle)
  return async (candles: Candle[], newCandle: Candle) => {
    const values: number[] = wmaTI({
      period: opts.period,
      values: candles.slice(-opts.period - 1).map(c => c[opts.key]),
    });

    return { [label]: values[values.length - 1] };
  };
};

export default wma;
