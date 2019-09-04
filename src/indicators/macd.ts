import { macd as macdTI } from 'technicalindicators';
import { Candle } from '@core/Env/Candle';
import { CandleIndicator } from '@src/indicators/CandleIndicator';
import { MACDOutput } from 'technicalindicators/declarations/moving_averages/MACD';
import { mergeLabel } from '@src/indicators/helpers';

interface MACDConfig {
  key: string;
  fastPeriod: number;
  slowPeriod: number;
  signalPeriod: number;
  SimpleMAOscillator: boolean;
  SimpleMASignal: boolean;
}

const DEFAULT_CONF: MACDConfig = {
  key: 'close',
  fastPeriod: 12,
  slowPeriod: 26,
  signalPeriod: 9,
  SimpleMAOscillator: true,
  SimpleMASignal: true,
};

// let i = 0;
const macd: CandleIndicator = (label: string, opts: MACDConfig) => {
  // indicators static variables
  const scope = {};
  // Merge config and extract key
  const { key, ...conf } = {
    ...DEFAULT_CONF,
    ...opts,
  };

  // Process function (called with each new candle)
  return async (candles: Candle[], newCandle: Candle) => {
    if (candles.length < conf.slowPeriod + conf.signalPeriod) return {};

    // Calc MACD
    const values: MACDOutput[] = macdTI({
      ...conf,
      values: candles.slice(-conf.slowPeriod - conf.signalPeriod).map(c => c[key]),
    });

    // Get MACD Output to return
    // create an object like { ${label}-MACD: 10..., ${label}-signal: 8..., ${label}-histogram: ...}
    return mergeLabel(values[values.length - 1], label);
  };
};

export default macd;
