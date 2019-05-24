import { sma as smaTI } from 'technicalindicators';
import { Candle } from '@core/Env/Candle';
import { CandleIndicator } from './CandleIndicator';

interface SMAConfig {
  period: number;
  key: string;
}

const sma: CandleIndicator = (label: string, opts: SMAConfig) => {
  // indicators static variables
  const scope = {};

  // Process function (called with each new candle)
  return async (candles: Candle[], newCandle: Candle) => {
    const values: number[] = smaTI({
      period: opts.period,
      values: candles.slice(-opts.period - 1).map(c => c[opts.key]),
    });

    return { [label]: values[values.length - 1] };
  };
};

export default sma;
