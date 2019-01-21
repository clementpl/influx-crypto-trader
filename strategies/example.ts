import { CandleSet } from '../src/_core/Env/CandleSet';
import { Trader } from '../src/exports';

// static give number of order running
let nbOrder = 0;
// export strategy
export default async function yourStrategy(candleSet: CandleSet, trader: Trader): Promise<string> {
  // const lastCandle = candleSet.getLast('binance:BTC:USDT') as Candle;

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
