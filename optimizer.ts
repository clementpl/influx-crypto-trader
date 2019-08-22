import { Optimizer } from './src/api/modules/Traders/Optimizer';
import { logger } from './src/logger';

Optimizer.genetic(
  {
    name: 'MACDTOP',
    test: true,
    strategie: 'MACDTOP-gen',
    persist: false,
    stratOpts: {
      agg1: '4h',
      fastPeriod1: 25,
      slowPeriod1: 57,
      signalPeriod1: 16,
      agg2: '5m',
      fastPeriod2: 25,
      slowPeriod2: 57,
      signalPeriod2: 16,
      agg3: '12h',
      fastPeriod3: 25,
      slowPeriod3: 57,
      signalPeriod3: 16,
      takeProfitTrigger: 0.03,
      takeProfitMargin: 0.025,
      stopLoss: 0.05,
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
      aggTimes: [],
      warmup: 50000,
      batchSize: 10000,
      bufferSize: 500,
      backtest: {
        start: '2018-10-01 00:00:00',
        stop: '2019-06-15 00:00:00',
      },
      candleSetPlugins: [],
    },
  },
  {
    threads: 6,
    silent: false,
    generation: 200,
    popSize: 10,
    elitism: 4,
    mutationRate: 0.5,
    envs: [
      {
        start: '2018-03-20 00:00:00',
        stop: '2018-07-10 00:00:00',
      },
      {
        start: '2018-10-10 00:00:00',
        stop: '2018-12-25 00:00:00',
      },
      {
        start: '2019-02-20 00:00:00',
        stop: '2019-03-20 00:00:00',
      },
    ],
    genes: [
      {
        key: 'stopLoss',
        min: 0.01,
        max: 0.1,
      },
      {
        key: 'takeProfitTrigger',
        min: 0.01,
        max: 0.1,
      },
      {
        key: 'takeProfitMargin',
        min: 0.005,
        max: 0.1,
      },
      {
        key: 'fastPeriod1',
        min: 5,
        max: 50,
        integer: true,
      },
      {
        key: 'slowPeriod1',
        min: 25,
        max: 75,
        integer: true,
      },
      {
        key: 'signalPeriod1',
        min: 5,
        max: 50,
        integer: true,
      },
      {
        key: 'fastPeriod2',
        min: 5,
        max: 50,
        integer: true,
      },
      {
        key: 'slowPeriod2',
        min: 25,
        max: 75,
        integer: true,
      },
      {
        key: 'signalPeriod2',
        min: 5,
        max: 50,
        integer: true,
      },
      {
        key: 'fastPeriod3',
        min: 5,
        max: 50,
        integer: true,
      },
      {
        key: 'slowPeriod3',
        min: 25,
        max: 75,
        integer: true,
      },
      {
        key: 'signalPeriod3',
        min: 5,
        max: 50,
        integer: true,
      },
      {
        key: 'agg1',
        list: ['5m', '10m', '15m', '30m', '1h', '2h', '4h'],
      },
      {
        key: 'agg2',
        list: ['5m', '15m', '30m', '1h', '2h', '4h', '6h'],
      },
      {
        key: 'agg3',
        list: ['15m', '30m', '1h', '2h', '4h', '6h', '12h'],
      },
    ],
  } as any
).catch(error => logger.error(error));
