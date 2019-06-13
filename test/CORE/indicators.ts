import * as chai from 'chai';
import { Trader, CandleSet, Env, logger, PluginConfig } from '@src/exports';
import { getTraderConfig } from '../helpers';
import { Candle } from '@src/_core/Env/Candle';
import { sma, ema, wma, wema, vwap, williamsr, rsi, macd } from 'technicalindicators';

async function runTraderWithIndicator(plugin: PluginConfig, backtest?: { start: string; stop: string }) {
  const traderConf = getTraderConfig('wait');
  traderConf.env.backtest = backtest || {
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
      try {
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
          values: candles.slice(-4).map(c => c.close),
        }).slice(-1)[0];
        chai.expect(candles.slice(-1)[0].indicators!.smalabel.toFixed(5)).equal(expectedVal.toFixed(5));
      } catch (error) {
        throw error;
      }
    }
    testit().then(() => done());
  });

  it('Check ema', done => {
    async function testit() {
      try {
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
          values: candles.slice(-4).map(c => c.close),
        }).slice(-1)[0];
        chai.expect(candles.slice(-1)[0].indicators!.emalabel.toFixed(5)).equal(expectedVal.toFixed(5));
      } catch (error) {
        throw error;
      }
    }
    testit().then(() => done());
  });

  it('Check wma', done => {
    async function testit() {
      try {
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
          values: candles.slice(-4).map(c => c.close),
        }).slice(-1)[0];
        chai.expect(candles.slice(-1)[0].indicators!.mylabel.toFixed(5)).equal(expectedVal.toFixed(5));
      } catch (error) {
        throw error;
      }
    }
    testit().then(() => done());
  });

  it('Check wema', done => {
    async function testit() {
      try {
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
          values: candles.slice(-4).map(c => c.close),
        }).slice(-1)[0];
        chai.expect(candles.slice(-1)[0].indicators!.mylabel.toFixed(5)).equal(expectedVal.toFixed(5));
      } catch (error) {
        throw error;
      }
    }
    testit().then(() => done());
  });

  it('Check rsi', done => {
    async function testit() {
      try {
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
          values: candles.slice(-4).map(c => c.close),
        }).slice(-1)[0];
        chai.expect(candles.slice(-1)[0].indicators!.mylabel.toFixed(5)).equal(expectedVal.toFixed(5));
      } catch (error) {
        throw error;
      }
    }
    testit().then(() => done());
  });

  it('Check williamsr', done => {
    async function testit() {
      try {
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
          high: candles.slice(-4).map(c => c.high),
          low: candles.slice(-4).map(c => c.low),
          close: candles.slice(-4).map(c => c.close),
        }).slice(-1)[0];
        chai.expect(candles.slice(-1)[0].indicators!.mylabel.toFixed(5)).equal(expectedVal.toFixed(5));
      } catch (error) {
        throw error;
      }
    }
    testit().then(() => done());
  });

  it('Check vwap', done => {
    async function testit() {
      const { trader, candles } = await runTraderWithIndicator({
        label: 'mylabel',
        opts: {
          name: 'vwap',
          period: 3,
        },
      });
      // Check strategy coherence
      const expectedVal = vwap({
        close: candles.slice(-3 - 1).map(c => c.close),
        high: candles.slice(-3 - 1).map(c => c.high),
        low: candles.slice(-3 - 1).map(c => c.low),
        volume: candles.slice(-3 - 1).map(c => c.volume),
      }).slice(-1)[0];
      chai.expect(candles.slice(-1)[0].indicators!.mylabel.toFixed(5)).equal(expectedVal.toFixed(5));
    }
    testit().then(() => done());
  });

  it('Check diff', done => {
    async function testit() {
      const { trader, candles } = await runTraderWithIndicator({
        label: 'mylabel',
        opts: {
          name: 'diff',
          key: 'close',
          period: 3,
        },
      });
      // Check strategy coherence
      const expectedVal =
        (candles[candles.length - 1].close - candles[candles.length - 3 - 1].close) /
        candles[candles.length - 3 - 1].close;
      chai.expect(candles.slice(-1)[0].indicators!.mylabel.toFixed(5)).equal(expectedVal.toFixed(5));
    }
    testit().then(() => done());
  });

  it('Check macd', done => {
    async function testit() {
      const { trader, candles } = await runTraderWithIndicator(
        {
          label: 'mylabel',
          opts: {
            name: 'macd',
            key: 'close',
            fastPeriod: 12,
            slowPeriod: 26,
            signalPeriod: 9,
            SimpleMAOscillator: true,
            SimpleMASignal: true,
          },
        },
        {
          start: '2018-02-20T00:00:00Z',
          stop: '2018-02-20T00:40:00Z',
        }
      );
      // Check strategy coherence
      const expectedVal = macd({
        fastPeriod: 12,
        slowPeriod: 26,
        signalPeriod: 9,
        SimpleMAOscillator: true,
        SimpleMASignal: true,
        values: candles.slice(-26 - 9).map(c => c.close),
      }).slice(-1)[0];
      chai.expect(candles.slice(-1)[0].indicators!['mylabel-MACD'].toFixed(5)).equal(expectedVal.MACD!.toFixed(5));
      chai.expect(candles.slice(-1)[0].indicators!['mylabel-signal'].toFixed(5)).equal(expectedVal.signal!.toFixed(5));
      chai
        .expect(candles.slice(-1)[0].indicators!['mylabel-histogram'].toFixed(5))
        .equal(expectedVal.histogram!.toFixed(5));
    }
    testit().then(() => done());
  });

  after(async () => {});
});
