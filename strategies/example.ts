import { CandleSet } from '../src/_core/Env/CandleSet';
import { Trader } from '../src/exports';
import { Candle } from '_core/Env/Candle';

// static give number of order running
let nbOrder = 0;
let i = 0;
// export strategy
export default async function yourStrategy(candleSet: CandleSet, trader: Trader): Promise<string> {
  if (i++ % 1000 === 0) {
    // multi currency possible (configure env => watchList [{BTC...}, {ETH}, ...])
    // multiTimerange possible (configure env => aggTimes ['15m', '1h', '4h'])
    const lastCandle = candleSet.getLast('binance:BTC:USDT', 2) as Candle[];
    const aggCandles = candleSet.getLast('binance:BTC:USDT:15m', 2) as Candle[];
    console.log(candleSet.getLast('binance:ETH:USDT', 2) as Candle[]);
  }

  const rand = Math.floor(Math.random() * 100);
  // BUY
  if (rand === 1 && nbOrder === 0) {
    nbOrder++;
    return 'buy';
  }
  // SELL
  if (
    nbOrder === 1 &&
    rand === 2
    // currentTrade &&
    // (rand === 2 || currentTrade.orderProfit >= 0.05 || currentTrade.orderProfit < -0.03)
  ) {
    nbOrder--;
    return 'sell';
  }
  return '';
}
