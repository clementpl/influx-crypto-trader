import { CandleSet } from '@src/_core/Env/CandleSet';
import { Trader, Candle, EnvConfig } from '@src/exports';
import { replacePlugins } from './utils';

// Create config:
//  - Set default conf
//  - Set plugins to EnvConfig
function makeConfig(env: EnvConfig, stratOpts: any) {
  const opts = Object.assign(
    {
      fastPeriod: 12,
      slowPeriod: 26,
      signalPeriod: 9,
      aggTime: '15m',
    },
    stratOpts
  );
  const name = 'macd';
  const plugins = [
    {
      label: 'macd',
      opts: {
        name,
        aggTime: opts.aggTime,
        fastPeriod: opts.fastPeriod,
        slowPeriod: opts.slowPeriod,
        signalPeriod: opts.signalPeriod,
      },
    },
  ];
  replacePlugins(env, plugins);
}
// export strategy
export default {
  beforeAll: function(env: EnvConfig, trader: Trader, stratOpts: any) {
    makeConfig(env, stratOpts);
    // Make symbol from trader config
    this.symbol = `${trader.config.exchange.name}:${trader.config.base}:${trader.config.quote}`;
    this.maxProfit = 0;
  },
  run: async function(candleSet: CandleSet, trader: Trader): Promise<string> {
    // const opts = trader.config.stratOpts;
    const currentTrade = trader.portfolio.trade;
    if (currentTrade && currentTrade.orderProfit > this.maxProfit) {
      this.maxProfit = currentTrade.orderProfit;
    }
    const lastCandle = candleSet.getLast(this.symbol) as Candle;
    let MACDAdvice = '';
    if (lastCandle.indicators!['macd-MACD'] > lastCandle.indicators!['macd-signal']) {
      MACDAdvice = 'buy';
    } else if (lastCandle.indicators!['macd-MACD'] < lastCandle.indicators!['macd-signal']) {
      MACDAdvice = 'sell';
    }

    const advice = MACDAdvice;
    if (!currentTrade && advice === 'buy') {
      return 'buy';
    }
    // SELL
    if (currentTrade && advice === 'sell') {
      this.maxProfit = 0;
      return 'sell';
    }
    return '';
  },
};
