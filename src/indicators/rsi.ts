import { rsi as rsiTI } from 'technicalindicators';
import { Candle } from '@core/Env/Candle';
import { CandleIndicator } from './CandleIndicator';

interface RSIConfig {
  period: number;
  key: string;
}

const DEFAULT_CONF: RSIConfig = {
  period: 14,
  key: 'close',
};

const rsi: CandleIndicator = (label: string, opts: RSIConfig) => {
  // Merge config and extract key
  const { key, ...conf } = {
    ...DEFAULT_CONF,
    ...opts,
  };

  // indicators static variables
  const scope = {};

  // Process function (called with each new candle)
  return async (candles: Candle[], newCandle: Candle) => {
    const values: number[] = rsiTI({
      period: conf.period,
      values: candles.slice(-conf.period - 1).map(c => c[key]),
    });

    return { [label]: values[values.length - 1] };
  };
};

export default rsi;
