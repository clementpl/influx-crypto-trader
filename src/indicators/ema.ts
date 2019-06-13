import { ema as emaTI } from 'technicalindicators';
import { Candle } from '@core/Env/Candle';
import { CandleIndicator } from './CandleIndicator';

interface EMAConfig {
  period: number;
  key: string;
}

const DEFAULT_CONF: EMAConfig = {
  period: 25,
  key: 'close',
};

const ema: CandleIndicator = (label: string, opts: EMAConfig) => {
  // Merge config and extract key
  const { key, ...conf } = {
    ...DEFAULT_CONF,
    ...opts,
  };

  // indicators static variables
  const scope = {};

  // Process function (called with each new candle)
  return async (candles: Candle[], newCandle: Candle) => {
    const values: number[] = emaTI({
      period: conf.period,
      values: candles.slice(-conf.period - 1).map(c => c[key]),
    });

    return { [label]: values[values.length - 1] };
  };
};

export default ema;
