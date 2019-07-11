import { TraderConfig } from '@src/exports';

export const getTraderConfig = (strat: string): TraderConfig => ({
  name: 'test_trader',
  test: true,
  persist: false,
  strategie: `test/${strat}`,
  stratOpts: {
    stopLoss: 0.03,
  },
  capital: 1000,
  percentInvest: 0.95,
  base: 'BTC',
  quote: 'USDT',
  exchange: {
    name: 'binance',
  },
  env: {
    watchList: [
      {
        base: 'BTC',
        quote: 'USDT',
        exchange: 'binance',
      },
    ],
    aggTimes: ['5m', '15m', '1h'],
    warmup: 2000,
    batchSize: 1000,
    bufferSize: 5000,
    backtest: {
      start: '2018-02-20T00:00:00Z',
      stop: '2018-03-01T00:00:00Z',
    },
    candleSetPlugins: [],
  },
});
