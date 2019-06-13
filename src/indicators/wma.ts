import { wma as wmaTI } from 'technicalindicators';
import { Candle } from '@core/Env/Candle';
import { CandleIndicator } from './CandleIndicator';

interface WMAConfig {
  period: number;
  key: string;
}

const DEFAULT_CONF: WMAConfig = {
  period: 25,
  key: 'close',
};

const wma: CandleIndicator = (label: string, opts: WMAConfig) => {
  // Merge config and extract key
  const { key, ...conf } = {
    ...DEFAULT_CONF,
    ...opts,
  };

  // indicators static variables
  const scope = {};

  // Process function (called with each new candle)
  return async (candles: Candle[], newCandle: Candle) => {
    const values: number[] = wmaTI({
      period: conf.period,
      values: candles.slice(-conf.period - 1).map(c => c[key]),
    });

    return { [label]: values[values.length - 1] };
  };
};

export default wma;
