import { TraderConfig } from '@src/exports';

export const getTraderConfig = (strat: string): TraderConfig => ({
  name: 'benchmark_trader',
  test: true,
  silent: true,
  saveInputs: false,
  strategie: `${strat}`,
  stratOpts: {
    stopLoss: 0.03,
  },
  capital: 10000,
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
    aggTimes: ['4h', '12h', '1h'],
    warmup: 50000,
    batchSize: 1000,
    bufferSize: 5000,
    backtest: {
      start: '2018-04-01T00:00:00Z',
      stop: '2018-06-01T00:00:00Z',
    },
    candleSetPlugins: [
      {
        label: 'macd',
        opts: {
          name: 'macd',
          aggTime: '4h',
          fastPeriod: 12,
          slowPeriod: 45,
          signalPeriod: 9,
        },
      },
      {
        label: 'macd',
        opts: {
          name: 'macd',
          aggTime: '12h',
          fastPeriod: 12,
          slowPeriod: 45,
          signalPeriod: 9,
        },
      },
      {
        label: 'macd',
        opts: {
          name: 'macd',
          aggTime: '1h',
          fastPeriod: 12,
          slowPeriod: 45,
          signalPeriod: 9,
        },
      },
    ],
  },
});

export async function benchmark(name: string, method: any) {
  const start = new Date().getTime();
  await method();
  const end = new Date().getTime();

  // Difference in milliseconds
  const difference = end - start;
  const minutes = Math.floor(difference / 1000 / 60);
  const seconds = Math.floor((difference / 1000) % 60);
  const ms = difference % 1000;
  // tslint:disable-next-line
  console.log(`${name}: ${minutes}m ${seconds}s ${ms}ms`);
}
