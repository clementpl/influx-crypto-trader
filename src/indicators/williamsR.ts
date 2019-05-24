import { williamsr } from 'technicalindicators';
import { Candle } from '@core/Env/Candle';
import { CandleIndicator } from './CandleIndicator';
import { mergeLabel } from './helpers';

interface WilliamsRConfig {
  period: number;
}

const DEFAULT_CONF: WilliamsRConfig = {
  period: 14,
};

const williamsR: CandleIndicator = (label: string, opts: WilliamsRConfig) => {
  // indicators static variables
  const scope = {};
  // Merge config and extract key
  const conf = {
    ...DEFAULT_CONF,
    ...opts,
  };

  // Process function (called with each new candle)
  return async (candles: Candle[], newCandle: Candle) => {
    if (candles.length < conf.period) return {};
    // Calc MACD
    const candlesPeriod = candles.slice(-conf.period);
    const values: number[] = williamsr({
      ...conf,
      high: candlesPeriod.map(c => c.high),
      low: candlesPeriod.map(c => c.low),
      close: candlesPeriod.map(c => c.close),
    });

    // Get bollingerbands Output to return
    // create an object like { label-lower: 10..., label-middle: 12..., label-upper: 15...}
    return mergeLabel(values[values.length - 1], label);
  };
};

export default williamsR;
