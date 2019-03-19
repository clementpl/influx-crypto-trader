import { rsi as rsiTI } from 'technicalindicators';
import { Candle } from '@core/Env/Candle';
import { CandleIndicator } from './CandleIndicator';

interface RSIConfig {
  period: number;
  key: string;
}

const rsi: CandleIndicator = (label: string, opts: RSIConfig) => {
  // indicators static variables
  const scope = {};

  // Process function (called with each new candle)
  return async (candles: Candle[], newCandle: Candle) => {
    const values: number[] = rsiTI({
      period: opts.period,
      values: candles
        .slice(-opts.period - 1)
        .concat(newCandle)
        .map(c => c[opts.key]),
    });

    return { [label]: values[values.length - 1] };
  };
};

export default rsi;
