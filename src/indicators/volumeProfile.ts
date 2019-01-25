import { volumeprofile as volumeProfileTI } from 'technicalindicators';
import { Candle } from '_core/Env/Candle';
import { CandleIndicator } from 'indicators/CandleIndicator';
import { mergeLabel } from './helpers';

interface VPConfig {
  name: string;
}

const volumeProfile: CandleIndicator = (label: string, opts: VPConfig) => {
  // indicators static variables
  const scope = {};

  // Process function (called with each new candle)
  return async (candles: Candle[], newCandle: Candle) => {
    const data = candles.slice(-1).concat(newCandle);

    const values: number[] = volumeProfileTI({
      close: data.map(c => c.close),
      open: data.map(c => c.open),
      high: data.map(c => c.high),
      low: data.map(c => c.low),
      volume: data.map(c => c.volume),
      noOfBars: 1,
    });

    // create an object like { label-MACD: 10..., label-signal: 8..., label-histogram: ...}
    return mergeLabel(values[values.length - 1], label);
  };
};

export default volumeProfile;
