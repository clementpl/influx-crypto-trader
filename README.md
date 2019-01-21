# influx crypto trader [![Build Status](https://travis-ci.org/clementpl/influx-crypto-trader.svg?branch=master)](https://travis-ci.org/clementpl/influx-crypto-trader)

## Description

Dependencie => [influx crypto watcher](https://github.com/clementpl/influx-crypto-watcher)

This project help you build trading strategy for cryptocurrencies and monitoring the performance with
[Grafana](https://grafana.com/) and
[InfluxDB](https://github.com/influxdata/influxdb)

## Getting started

Required

You should first install [influx crypto watcher](https://github.com/clementpl/influx-crypto-watcher) and follow the getting started (setting up grafana, influx docker + create your first watcher on binance BTC/USDT and write data into influx)

Install dependencies

`npm install`

Start api

`npm start`

Create your first trader (binance, BTC/USDT) using the strategy example.ts.

```
curl --request POST \
  --url http://localhost:3004/traders \
  --header 'content-type: application/json' \
  --data '{
      "name": "backtest",
      "test": true,
      "strategie": "example",
      "capital": 1000,
      "percentInvest": 0.25,
      "base": "BTC",
      "quote": "USDT",
      "env": {
        "watchList": [
            {"base": "BTC",
            "quote": "USDT",
            "exchange": "binance"
            }],
        "warmup": 1500,
        "batchSize": 1000,
        "bufferSize": 5000,
        "backtest": {
            "start": "2018-02-15 00:00:00",
            "stop": "2018-09-15 00:00:00"
        }
    },
    "exchange": {
        "name": "binance"
    }
}'
```

Then go to grafana (http://localhost:3001/), import the dashboard given in "grafana/dashboard/cypto-trader.json" and watch your strategy (you can easily customize the dashboard to fit your need)

![dashboard](/grafana/dashboard/crypto-trader.png)

## Strategy

Actually a trader can manage only one order at a time (one buy => one sell, ...).

You can build new strategy in ./strategie/ folder. See (example.ts).

Basically its a function called at each timestep, which should return the action to make 'wait'/'buy'/'sell')

The function is called with the candleSet (stock market data) and the trader (order/portfolio data)

```
export default async function yourStrategy(candleSet: CandleSet, trader: Trader): Promise<string> {
  const lastCandle = candleSet.getLast('binance:BTC:USDT', 10) as Candle[]; // retrieve 10 last candle BTC/USDT on binance
  console.log(lastCandle);
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

```

## API

- Doc available at http://localhost:3000/docs generated with [lout](https://github.com/hapijs/lout)
- Easy trader deployment
- Trade on specific currencies

The software let you deploy trader which will run in a live/simulation or backtest environment using a specific strategy.

```
{
      "name": "backtest", // trader name
      "test": true, // if true => simulation
      "strategie": "MACD", // name of the strategy to use (see ./strategies folder), you can also test MACD
      "capital": 1000,
      "percentInvest": 0.25,
      "base": "BTC",
      "quote": "USDT",
      "env": {
	  "watchList": [
		{ "base": "BTC", "quote": "USDT", "exchange": "binance" }
	  ],
	  "warmup": 1500,
	  "batchSize": 1000,
	  "bufferSize": 5000,
	  "backtest": {
          "start": "2018-02-15 00:00:00",
      	  "stop": "2018-09-15 00:00:00"
	  }
    },
    "exchange": {
      "name": "binance",
      // apiKey... TO TEST in live
    }
}
```

Every trader are persist to MongoDB to restart them on reboot (persist OK, restart TODO).

I'm also working on a machine learning part with tensorflow (Supervised and Reinforcement learning)

Any help can be usefull to make the software "stronger" :)
