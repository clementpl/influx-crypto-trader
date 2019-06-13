import { sma as smaTI } from 'technicalindicators';
import { Candle } from '@core/Env/Candle';
import { CandleIndicator } from './CandleIndicator';

interface SMAConfig {
  period: number;
  key: string;
}

const DEFAULT_CONF: SMAConfig = {
  period: 25,
  key: 'close',
};

const sma: CandleIndicator = (label: string, opts: SMAConfig) => {
  // Merge config and extract key
  const { key, ...conf } = {
    ...DEFAULT_CONF,
    ...opts,
  };

  // indicators static variables
  const scope = {};

  // Process function (called with each new candle)
  return async (candles: Candle[], newCandle: Candle) => {
    if (!newCandle) return { [label]: undefined };
    const values: number[] = smaTI({
      period: conf.period,
      values: candles.slice(-conf.period - 1).map(c => c[key]),
    });

    return { [label]: values[values.length - 1] };
  };
};

export default sma;
