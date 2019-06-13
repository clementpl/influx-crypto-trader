import { stochastic as stochasticTI } from 'technicalindicators';
import { StochasticOutput } from 'technicalindicators/declarations/momentum/Stochastic';
import { Candle } from '@core/Env/Candle';
import { CandleIndicator } from './CandleIndicator';
import { mergeLabel } from './helpers';

interface StochConfig {
  period: number;
  signalPeriod: number;
}

const DEFAULT_CONF: StochConfig = {
  period: 14,
  signalPeriod: 9,
};

const stochastic: CandleIndicator = (label: string, opts: StochConfig) => {
  // Merge config and extract key
  const conf = {
    ...DEFAULT_CONF,
    ...opts,
  };

  // indicators static variables
  const scope = {};

  // Process function (called with each new candle)
  return async (candles: Candle[], newCandle: Candle) => {
    candles = candles.slice(-opts.period - 1);

    const values: StochasticOutput[] = stochasticTI({
      period: opts.period,
      signalPeriod: opts.signalPeriod,
      high: candles.map(c => c.high),
      low: candles.map(c => c.low),
      close: candles.map(c => c.close),
    });
    return mergeLabel(values[values.length - 1], label);
  };
};

export default stochastic;
