import { Candle } from '@core/Env/Candle';
import { CandleIndicator } from '@indicators/CandleIndicator';
import { deepFind } from '@core/helpers';

interface DiffConfig {
  period: number;
  key: string;
}

const DEFAULT_CONF: DiffConfig = {
  key: 'close',
  period: 14,
};

const diff: CandleIndicator = (label: string, opts: DiffConfig) => {
  // Merge config and extract key
  const { key, ...conf } = {
    ...DEFAULT_CONF,
    ...opts,
  };

  // indicators static variables
  const scope = {};

  // Process function (called with each new candle)
  return async (candles: Candle[], newCandle: Candle) => {
    let val: number | undefined;
    if (candles.length >= conf.period) {
      const previous: number = deepFind(candles[candles.length - conf.period - 1], key);
      const current: number = deepFind(newCandle, key);
      val = (current - previous) / previous;
    }
    return { [label]: val };
  };
};

export default diff;
