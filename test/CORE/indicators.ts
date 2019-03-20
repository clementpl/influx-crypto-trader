import * as chai from 'chai';
import { Trader, CandleSet, Env, logger, PluginConfig } from '@src/exports';
import { getTraderConfig } from '../helpers';
import { Candle } from '@src/_core/Env/Candle';
import { sma, ema, wma, wema, vwap, williamsr, rsi } from 'technicalindicators';

async function runTraderWithIndicator(plugin: PluginConfig) {
  const traderConf = getTraderConfig('wait');
  traderConf.env.backtest = {
    start: '2018-02-20T00:00:00Z',
    stop: '2018-02-20T00:04:00Z',
  };
  (<any>traderConf.env).candleSetPlugins = [plugin];
  logger.silent = true;
  const trader = new Trader(traderConf);
  await trader.init();
  // Change strategy to get last candles
  const candles: Candle[] = [];
  trader.strategy.run = async (candleSet: CandleSet, trader: Trader, stratOpts: any) => {
    const last = candleSet.getLast(Env.makeSymbol(traderConf.env.watchList[0]), 1) as Candle;
    candles.push(last);
    return 'wait';
  };
  await trader.start();
  await trader.stop();
  logger.silent = false;
  return { trader, candles };
}

/*
 * Test traderWorker
 */
describe('Indicators', () => {
  before(async () => {});

  it('Check sma', done => {
    async function testit() {
      const { trader, candles } = await runTraderWithIndicator({
        label: 'smalabel',
        opts: {
          name: 'sma',
          period: 3,
          key: 'close',
        },
      });
      // Check strategy coherence
      const expectedVal = sma({
        period: 3,
        values: candles.map(c => c.close),
      }).slice(-1)[0];
      chai.expect(candles.slice(-1)[0].indicators!.smalabel.toFixed(5)).equal(expectedVal.toFixed(5));
    }
    testit().then(() => done());
  });

  it('Check ema', done => {
    async function testit() {
      const { trader, candles } = await runTraderWithIndicator({
        label: 'emalabel',
        opts: {
          name: 'ema',
          period: 3,
          key: 'close',
        },
      });
      // Check strategy coherence
      const expectedVal = ema({
        period: 3,
        values: candles.map(c => c.close),
      }).slice(-1)[0];
      chai.expect(candles.slice(-1)[0].indicators!.emalabel.toFixed(5)).equal(expectedVal.toFixed(5));
    }
    testit().then(() => done());
  });

  it('Check wma', done => {
    async function testit() {
      const { trader, candles } = await runTraderWithIndicator({
        label: 'mylabel',
        opts: {
          name: 'wma',
          period: 3,
          key: 'close',
        },
      });
      // Check strategy coherence
      const expectedVal = wma({
        period: 3,
        values: candles.map(c => c.close),
      }).slice(-1)[0];
      chai.expect(candles.slice(-1)[0].indicators!.mylabel.toFixed(5)).equal(expectedVal.toFixed(5));
    }
    testit().then(() => done());
  });

  it('Check wema', done => {
    async function testit() {
      const { trader, candles } = await runTraderWithIndicator({
        label: 'mylabel',
        opts: {
          name: 'wema',
          period: 3,
          key: 'close',
        },
      });
      // Check strategy coherence
      const expectedVal = wema({
        period: 3,
        values: candles.map(c => c.close),
      }).slice(-1)[0];
      chai.expect(candles.slice(-1)[0].indicators!.mylabel.toFixed(5)).equal(expectedVal.toFixed(5));
    }
    testit().then(() => done());
  });

  it('Check rsi', done => {
    async function testit() {
      const { trader, candles } = await runTraderWithIndicator({
        label: 'mylabel',
        opts: {
          name: 'rsi',
          period: 3,
          key: 'close',
        },
      });
      // Check strategy coherence
      const expectedVal = rsi({
        period: 3,
        values: candles.map(c => c.close),
      }).slice(-1)[0];
      chai.expect(candles.slice(-1)[0].indicators!.mylabel.toFixed(5)).equal(expectedVal.toFixed(5));
    }
    testit().then(() => done());
  });

  it('Check williamsr', done => {
    async function testit() {
      const { trader, candles } = await runTraderWithIndicator({
        label: 'mylabel',
        opts: {
          name: 'williamsR',
          period: 3,
          key: 'close',
        },
      });
      // Check strategy coherence
      const expectedVal = williamsr({
        period: 3,
        high: candles.map(c => c.high),
        low: candles.map(c => c.low),
        close: candles.map(c => c.close),
      }).slice(-1)[0];
      chai.expect(candles.slice(-1)[0].indicators!.mylabel.toFixed(5)).equal(expectedVal.toFixed(5));
    }
    testit().then(() => done());
  });

  /*it('Check vwap', done => {
    async function testit() {
      const { trader, candles } = await runTraderWithIndicator({
        label: 'mylabel',
        opts: {
          name: 'vwap',
        },
      });
      // Check strategy coherence
      const expectedVal = vwap({
        close: candles.map(c => c.close),
        high: candles.map(c => c.high),
        low: candles.map(c => c.low),
        volume: candles.map(c => c.volume),
      }).slice(-1)[0];
      chai.expect(candles.slice(-1)[0].indicators!.mylabel.toFixed(5)).equal(expectedVal.toFixed(5));
    }
    testit().then(() => done());
  });*/

  after(async () => {});
});
