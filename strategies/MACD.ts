import { CandleSet, Candle } from '_core/Env/CandleSet';
import { Trader } from 'exports';

// static give number of order running
let nbOrder = 0;
let i = 0;
// export strategy
export default async function yourStrategy(candleSet: CandleSet, trader: Trader): Promise<string> {
  // last
  if (i % 1000 === 0) console.log('RELB');
  i++;
  const lastCandle = candleSet.getLast('binance:BTC:USDT') as Candle;
  const lastMACD = lastCandle.indicators.MACD;
  let MACDAdvice = '';
  if (
    lastMACD.MACD > lastMACD.signal &&
    lastCandle.indicators.RSI < 45
    // && lastCandle.close < lastCandle.indicators.BB.middle
  ) {
    MACDAdvice = 'buy';
  } else if (lastMACD.MACD < lastMACD.signal - 5) {
    MACDAdvice = 'sell';
  }

  const advice = MACDAdvice;
  const currentTrade = trader.portfolio.trade;

  if (!currentTrade && advice === 'buy') {
    nbOrder++;
    /*console.log('buy');
    console.log(lastMACD);
    console.log(lastCandle.indicators.RSI);*/
    return 'buy';
  }
  // SELL
  if (
    currentTrade &&
    (advice === 'sell' || currentTrade.orderProfit < -0.03)
    // currentTrade &&
    // (rand === 2 || currentTrade.orderProfit >= 0.05 || currentTrade.orderProfit < -0.03)
  ) {
    nbOrder--;
    return 'sell';
  }
  return '';
}
