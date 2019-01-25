import { vwap as vwapTI } from 'technicalindicators';
import { Candle } from '_core/Env/Candle';
import { CandleIndicator } from 'indicators/CandleIndicator';

interface VWAPConfig {
  name: string;
}

const vwap: CandleIndicator = (label: string, opts: VWAPConfig) => {
  // indicators static variables
  const scope = {};

  // Process function (called with each new candle)
  return async (candles: Candle[], newCandle: Candle) => {
    const data = candles.slice(-1).concat(newCandle);

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
