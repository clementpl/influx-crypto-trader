import { volumeprofile as volumeProfileTI } from 'technicalindicators';
import { Candle } from '@core/Env/Candle';
import { CandleIndicator } from './CandleIndicator';
import { mergeLabel } from './helpers';

interface VPConfig {
  period: number;
  noOfBars: number;
}

const DEFAULT_CONF: VPConfig = {
  period: 25,
  noOfBars: 1,
};

const volumeProfile: CandleIndicator = (label: string, opts: VPConfig) => {
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

    const values: number[] = volumeProfileTI({
      close: data.map(c => c.close),
      open: data.map(c => c.open),
      high: data.map(c => c.high),
      low: data.map(c => c.low),
      volume: data.map(c => c.volume),
      noOfBars: conf.noOfBars,
    });

    // create an object like { label-MACD: 10..., label-signal: 8..., label-histogram: ...}
    return mergeLabel(values[values.length - 1], label);
  };
};

export default volumeProfile;
