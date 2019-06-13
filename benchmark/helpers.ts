import { TraderConfig } from '@src/exports';

const MACDPlugins = [
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
    label: 'macd2',
    opts: {
      name: 'macd',
      aggTime: '2h',
      fastPeriod: 12,
      slowPeriod: 45,
      signalPeriod: 9,
    },
  },
  {
    label: 'macd3',
    opts: {
      name: 'macd',
      aggTime: '1h',
      fastPeriod: 12,
      slowPeriod: 45,
      signalPeriod: 9,
    },
  },
];

const SMAPlugins = [
  {
    label: 'sma',
    opts: {
      name: 'sma',
      aggTime: '1h',
      period: 25,
    },
  },
  {
    label: 'sma1',
    opts: {
      name: 'sma',
      aggTime: '15m',
      period: 25,
    },
  },
  {
    label: 'sma2',
    opts: {
      name: 'sma',
      aggTime: '4h',
      period: 10,
    },
  },
];

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
      start: '2018-02-20T00:00:00Z',
      stop: '2018-03-15T00:00:00Z',
    },
    candleSetPlugins: strat === 'Benchmark/MACD' ? MACDPlugins : SMAPlugins,
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
