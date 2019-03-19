import { bollingerbands } from 'technicalindicators';
import { Candle } from '@core/Env/Candle';
import { CandleIndicator } from './CandleIndicator';
import { mergeLabel } from './helpers';
import { BollingerBandsOutput } from 'technicalindicators/declarations/volatility/BollingerBands';

interface BollingerConfig {
  key: string;
  period: number;
  stdDev: number;
}

const DEFAULT_CONF: BollingerConfig = {
  key: 'close',
  period: 14,
  stdDev: 2,
};

const bollinger: CandleIndicator = (label: string, opts: BollingerConfig) => {
  // indicators static variables
  const scope = {};
  // Merge config and extract key
  const { key, ...conf } = {
    ...DEFAULT_CONF,
    ...opts,
  };

  // Process function (called with each new candle)
  return async (candles: Candle[], newCandle: Candle) => {
    if (candles.length < conf.period) return {};
    // Calc MACD
    const values: BollingerBandsOutput[] = bollingerbands({
      ...conf,
      values: candles
        .slice(-conf.period)
        .concat(newCandle)
        .map(c => c[key]),
    });

    // Get bollingerbands Output to return
    // create an object like { label-lower: 10..., label-middle: 12..., label-upper: 15...}
    return mergeLabel(values[values.length - 1], label);
  };
};

export default bollinger;
