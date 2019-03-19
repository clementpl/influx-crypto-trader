import { stochastic as stochasticTI } from 'technicalindicators';
import { StochasticOutput } from 'technicalindicators/declarations/momentum/Stochastic';
import { Candle } from '@core/Env/Candle';
import { CandleIndicator } from './CandleIndicator';
import { mergeLabel } from './helpers';

interface RSIConfig {
  period: number;
  signalPeriod: number;
}

const stochastic: CandleIndicator = (label: string, opts: RSIConfig) => {
  // indicators static variables
  const scope = {};

  // Process function (called with each new candle)
  return async (candles: Candle[], newCandle: Candle) => {
    const values: StochasticOutput[] = stochasticTI({
      period: opts.period,
      signalPeriod: opts.signalPeriod,
      high: candles
        .slice(-opts.period - 1)
        .concat(newCandle)
        .map(c => c.high),
      low: candles
        .slice(-opts.period - 1)
        .concat(newCandle)
        .map(c => c.low),
      close: candles
        .slice(-opts.period - 1)
        .concat(newCandle)
        .map(c => c.close),
    });
    return mergeLabel(values[values.length - 1], label);
  };
};

export default stochastic;
