import { ema as emaTI } from 'technicalindicators';
import { Candle } from '@core/Env/Candle';
import { CandleIndicator } from './CandleIndicator';

interface EMAConfig {
  period: number;
  key: string;
}

const ema: CandleIndicator = (label: string, opts: EMAConfig) => {
  // indicators static variables
  const scope = {};

  // Process function (called with each new candle)
  return async (candles: Candle[], newCandle: Candle) => {
    candles = candles.slice(-opts.period - 1);
    candles.push(newCandle);
    const values: number[] = emaTI({
      period: opts.period,
      values: candles.map(c => c[opts.key]),
    });

    return { [label]: values[values.length - 1] };
  };
};

export default ema;
