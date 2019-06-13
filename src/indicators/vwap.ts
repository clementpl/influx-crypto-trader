import { vwap as vwapTI } from 'technicalindicators';
import { Candle } from '@core/Env/Candle';
import { CandleIndicator } from './CandleIndicator';

interface VWAPConfig {
  period: number;
}

const DEFAULT_CONF: VWAPConfig = {
  period: 25,
};

const vwap: CandleIndicator = (label: string, opts: VWAPConfig) => {
  // Merge config and extract key
  const conf = {
    ...DEFAULT_CONF,
    ...opts,
  };

  // indicators static variables
  const scope = {};

  // Process function (called with each new candle)
  return async (candles: Candle[], newCandle: Candle) => {
    const data = candles.slice(-conf.period - 1);

    const values: number[] = vwapTI({
      close: data.map(c => c.close),
      high: data.map(c => c.high),
      low: data.map(c => c.low),
      volume: data.map(c => c.volume),
    });

    return { [label]: values[values.length - 1] };
  };
};

export default vwap;
