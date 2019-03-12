# influx crypto trader [![Build Status](https://travis-ci.org/clementpl/influx-crypto-trader.svg?branch=master)](https://travis-ci.org/clementpl/influx-crypto-trader)

## Description

Dependencie => [influx crypto watcher](https://github.com/clementpl/influx-crypto-watcher)

This project help you build trading strategy for cryptocurrencies and monitoring the performance with
[Grafana](https://grafana.com/) and
[InfluxDB](https://github.com/influxdata/influxdb)

Features:

- Simulation/Backtesting (Live TODO)
- Configure trader to work with multiple cryptocurrencies and multiple timeframe easily
- Create new indicator (nodejs)
- Create your own strategy (nodejs)
- Optimize a strategy using genetic algorithm (api POST request)
- Trader workers, Each trader run in a subprocess (communication using IPC)

## Getting started

Required

You should first install [influx crypto watcher](https://github.com/clementpl/influx-crypto-watcher) and follow the getting started (setting up grafana, influx docker + create your first watcher on binance BTC/USDT and write data into influx)

Install dependencies

`npm install`

Start api

`npm start`

Create your first trader (binance, BTC/USDT) using the strategy example.ts and 2 indicators (sma6h and it's variation on 1h)

```
curl --request POST \
  --url http://localhost:3004/traders \
  --header 'content-type: application/json' \
  --data '{
      "name": "backtest",
      "test": true,
      "strategie": "example",
      "stratOpts": {},
      "capital": 1000,
      "percentInvest": 0.25,
      "base": "BTC",
      "quote": "USDT",
      "exchange": {
        "name": "binance"
      },
      "env": {
        "watchList": [
            {"base": "BTC",
            "quote": "USDT",
            "exchange": "binance"
            }],
        "aggTimes": ["15m", "1h", "1d"],
        "warmup": 1500,
        "batchSize": 1000,
        "bufferSize": 5000,
        "backtest": {
            "start": "2018-04-15 00:00:00",
            "stop": "2018-05-15 00:00:00"
        },
    	"candleSetPlugins": [
        {
          "label": "sma6h",
          "opts": {
            "name": "sma",
            "period": 360,
            "key": "close"
          }
        },
        {
          "label": "var1hsma6h",
          "opts": {
            "name": "diff",
            "period": 60,
            "key": "indicators.sma6h"
          }
        }
      ]
  }
}'
```

Then go to grafana (http://localhost:3001/):

- Configure data source

![datasource](/grafana/data-source-conf-example.png)

- import the dashboard given in "grafana/dashboard/cypto-trader.json" and watch your portfolio history, buy/sell

You can easily customize the dashboard to fit your need

![dashboard](/grafana/dashboard/crypto-trader.png)

## Strategy

Actually a trader can manage only one order at a time (one buy => one sell, ...).

You can build new strategy in ./strategies/ folder. See (example.ts).

A strategy is an object of several callback.

```
public strategy: {
  // BeforeAll callback can be usefull to set you candleSet plugins/indicators directly in the strategy exported
  beforeAll?: (env: EnvConfig, trader: Trader, stratOpts: any) => Promise<void>;
  before?: (candleSet: CandleSet, trader: Trader, stratOpts: any) => Promise<void>;
  run: (candleSet: CandleSet, trader: Trader, stratOpts: any) => Promise<string>;
  after?: (candleSet: CandleSet, trader: Trader, stratOpts: any) => Promise<void>;
  afterAll?: (candleSet: CandleSet, trader: Trader, stratOpts: any) => Promise<void>;
};
```

You can export an object with only the run function (required).
The function is called at each timestep and need to return the action taken ('wait'/'buy'/'sell').

The function is called with the candleSet (stock market data), the trader (order/portfolio data) and the strategy options

```
export default {
  beforeAll: async function beforeAll(env: EnvConfig, trader: Trader, stratOpts: any): Promise<string> {
    console.log('beforeAll callback');
  },
  run: async function yourStrategy(candleSet: CandleSet, trader: Trader, stratOpts: any): Promise<string> {
    const lastCandle = candleSet.getLast('binance:BTC:USDT', 10) as Candle[]; // retrieve 10 last candle BTC/USDT on binance
    const lastCandle1 = candleSet.getLast('binance:BTC:USDT:15m', 10) as Candle[]; // retrieve 10 last candle agg on 15 minutes BTC/USDT on binance
    const lastCandle2 = candleSet.getLast('binance:ETH:USDT:15m', 10) as Candle[]; // retrieve 10 last candle agg on 15 minutes ETH/USDT on binance
    console.log(lastCandle);
    console.log(lastCandle1);
    console.log(lastCandle2);

    const rand = Math.floor(Math.random() * 100);
    // BUY
    if (rand === 1 && nbOrder === 0) {
      nbOrder++;
      return 'buy'; // tell the trader to buy (if he can)
    }
    // SELL
    if (nbOrder === 1 && rand === 2) {
      nbOrder--;
      return 'sell'; // tell the trader to sell (if he can)
    }
    return ''; // wait can be any string ('' || 'wait' || ...)
  }
}
```

## Indicators

The environment connect to influxdb to fetch candle and then process it at each timestep. The environment is plug with a CandleSet class which manage the candles data (buffer, timeframe, indicators computation, etc...)

We can easily map indicators to the candleSet when configuring an environment. A candleSetPlugin is define as:

```
{
  "label": "sma6h", // name of the indicator (any string)
  "opts": { // indicator opts
    "name": "sma", // indicator name (cf: src/indicators)
    "period": 360, // sma period 360 minutes
    "key": "close" // sma on which key (open/high/low/close/volume)
    "aggTime": "15m" // OPTIONAL: You can specify which candlestick timerange you want to get as parameter (be carefull to properly configure environment with appropriate aggTimes: [..., ...])
	}
}
```

In the following example we define an environment with 2 indicators sma6h and var1hsma6h.

Be carrefull of the plugin order when using indicator in another indicator. (here first sma then diff)

```
      "env": {
        // Watch 2 currency (ETH/USDT, BTC/USDT) be carefull to import data using influx-crypto-watcher
        "watchList": [
          {"base": "BTC","quote": "USDT","exchange": "binance"}
          {"base": "ETH","quote": "USDT","exchange": "binance"}
        ],
        "aggTimes": ['15m', '4h', 1d'],
        "warmup": 1500,
        "batchSize": 1000,
        "bufferSize": 5000,
        "backtest": {
            "start": "2018-02-15 00:00:00",
            "stop": "2018-09-15 00:00:00"
        },
    	"candleSetPlugins": [
        {
          "label": "sma6h",
          "opts": {
            "name": "sma",
            "period": 360,
            "aggTime": "15m", // Will receive candles agg by 15 minutes (00:00, 00:15, 00:30, ...)
            "key": "close"
        }
      },
      {
        "label": "var1hsma6h",
        "opts": {
          "name": "diff",
          "period": 60,
          "key": "indicators.sma6h"
        }
      }
    ]
  }
```

You can easily create new indicators in src/indicators
(the filename is use as indicator name).

```
type CandleIndicator = (label: string, opts: any) => CandleSetPlugin;

type CandleSetPlugin = (candles: Candle[], newCandle: Candle) => Promise<{ [name: string]: any }>;
```

Example:

Create a new file => src/indicators/myindicator

Then you must export a CandleIndicator.

This indicator is dividing the given key by the given factor

```
import { Candle } from '../_core/Env/CandleSet';
import { CandleIndicator } from './CandleIndicator';

const myindicator: CandleIndicator = (label: string, opts: any) => {
  // indicators static variables
  const scope = {};

  // Process function
  // This function is called with each new candle
  return async (candles: Candle[], newCandle: Candle) => {
    return { [label]:  newCandle[opts.key] / opts.factor};
  };
};

export default myindicator;
```

Then you can use it when configuring environment (here divide close by 2 and name it lalala)

```
{
	"label": "lalala",
	"opts": {
	  "name": "myindicator",
    "key": "close"
  	"factor": 2,
 	}
}
```

## API

- Doc available at http://localhost:3000/docs generated with [lout](https://github.com/hapijs/lout)
- Easy trader deployment
- Trade on specific currencies

The software let you deploy trader which will run in a live/simulation or backtest environment using a specific strategy.

```
{
      // Trader configuration
      "name": "backtest", // trader name
      "test": true, // if true => simulation
      "strategie": "MACD", // name of the strategy to use (see ./strategies folder), you can also test MACD
      "stratOpts": {},
      "capital": 1000, // quote capital (here USDT)
      "percentInvest": 0.25, // percent invest per trader 25%
      "base": "BTC",
      "quote": "USDT",
      "exchange": {
        "name": "binance",
        // apiKeys... Not fully implemented yet
      }

      // Environment configuration
      "env": {
        // Currency to watch (Not tested with multiples yet)
        "watchList": [
          { "base": "BTC", "quote": "USDT", "exchange": "binance" }
        ],
        "aggTimes": ['15m', '4h', 1d'],
        "warmup": 1500, // How many cadle to fetch before start date
        "batchSize": 1000, // Batch size when fetching data
        "bufferSize": 5000, // candleSet buffer size (here history of 5000 candles)
        // backtest configuration (start/stop date)
        "backtest": {
          "start": "2018-02-15 00:00:00",
          "stop": "2018-09-15 00:00:00"
        }
        // Plugins indicator
        "candleSetPlugins": [
        {
          "label": "sma6h",
          "opts": {
            "name": "sma", // indicator name (see src/indicators)
            "period": 360,
            "key": "close"
          }
        },
        {
          "label": "sma6hagg15m",
          "opts": {
            "name": "sma", // indicator name (see src/indicators)
            "aggTime": "15m",
            "period": 360,
            "key": "close"
          }
        }
      ]
    }
}
```

Every trader are persist to MongoDB to restart them on reboot (persist OK, restart TODO).

I'm also working on machine learning stuff with tensorflow (Supervised and Reinforcement learning)

You can email me at clement22860@gmail.com.
