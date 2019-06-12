import { CandleSet } from '@src/_core/Env/CandleSet';
import { Trader } from '@src/exports';
import { Candle } from '@core/Env/Candle';

// static give number of order running
let i = 0;
// export strategy
export default {
  run: async function yourStrategy(candleSet: CandleSet, trader: Trader): Promise<string> {
    if (i++ % 1000 === 0) {
      // multi currency possible (configure env => watchList [{BTC...}, {ETH}, ...])
      // multi timeframe possible (configure env => aggTimes ['15m', '1h', '4h'])
      const lastCandle = candleSet.getLast('binance:BTC:USDT', 2) as Candle[];
      const aggCandles = candleSet.getLast('binance:BTC:USDT:15m', 2) as Candle[];
    }

    const currentTrade = trader.portfolio.trade;
    const rand = Math.floor(Math.random() * 100);
    // BUY
    if (!currentTrade && rand === 1) {
      return 'buy';
    }
    // SELL
    if (currentTrade && rand === 2) {
      return 'sell';
    }
    return '';
  },
};
