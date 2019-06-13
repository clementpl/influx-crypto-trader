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
/*
73
74
{
  MACD: 85.00645614034693,
  signal: 106.52193684210249,
  histogram: -21.515480701755564
}
scope
73
74
{
  MACD: -625.444666666659,
  signal: -879.980203508767,
  histogram: 254.53553684210794
}
*/

/*
73
74
{
  MACD: 35.02272280701436,
  signal: 68.23829342105125,
  histogram: -33.21557061403689
}
scope
73
74
{
  MACD: 778.1097052631558,
  signal: 855.8901043859648,
  histogram: -77.78039912280906
}
*/
export default macd;
