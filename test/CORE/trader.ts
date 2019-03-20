import * as chai from 'chai';
import { Trader, CandleSet, Env, logger, TraderWorker } from '@src/exports';
import { getTraderConfig } from '../helpers';
import { Candle } from '@src/_core/Env/Candle';

/*
 * Test traderWorker
 */
describe('Trader', () => {
  before(async () => {});

  it('Create and run a trader doing a wait strategy for 5 minutes (BTC/USDT)', done => {
    async function testit() {
      const traderConf = getTraderConfig('wait');
      traderConf.env.backtest = {
        start: '2018-02-20T00:00:00Z',
        stop: '2018-02-20T00:04:00Z',
      };
      // Init trader
      const trader = new Trader(traderConf);
      logger.silent = true;
      await trader.init();
      // Change strategy to count every call
      let countStratCall = 0;
      const timestamps: string[] = [];
      let agg5m: Candle[] = [];
      const agg1m: Candle[] = [];
      trader.strategy.run = async (candleSet: CandleSet, trader: Trader, stratOpts: any) => {
        const last = candleSet.getLast(Env.makeSymbol(traderConf.env.watchList[0]), 1) as Candle;
        // push agg
        agg1m.push(last);
        agg5m = candleSet.getLast(`${Env.makeSymbol(traderConf.env.watchList[0])}:5m`, 3) as Candle[];
        // push ts
        timestamps.push(new Date(last.time).toISOString());
        // incr counter
        countStratCall++;
        return 'wait';
      };
      await trader.start();
      await trader.stop();
      logger.silent = false;

      // Check portfolio coherence
      chai.expect(trader.portfolio.indicators.currentCapital).equal(traderConf.capital);
      chai.expect(trader.portfolio.indicators.currentProfit).equal(0);
      chai.expect(trader.portfolio.indicators.fees).equal(0);
      chai.expect(trader.portfolio.indicators.totalValue).equal(traderConf.capital);
      // Check strategy coherence
      chai.expect(countStratCall).equal(5);
      const exepectedTimestamps = [
        '2018-02-20T00:00:00.000Z',
        '2018-02-20T00:01:00.000Z',
        '2018-02-20T00:02:00.000Z',
        '2018-02-20T00:03:00.000Z',
        '2018-02-20T00:04:00.000Z',
      ];
      timestamps.forEach((time, idx) => chai.expect(time).equal(exepectedTimestamps[idx]));
      // Check aggTime, time 5 min ago should be equal to time of the last candle aggregated (5m)
      chai.expect(agg5m.slice(-1)[0].time).equal(agg1m.slice(-5)[0].time);
    }
    testit().then(() => done());
  });

  /* PROBLEM when loading worker file
  it('Create and run a trader WORKER doing a wait strategy for 5 minutes (BTC/USDT)', done => {
    async function testit() {
      const traderConf = getTraderConfig('wait');
      traderConf.env.backtest = {
        start: '2018-02-20T00:00:00Z',
        stop: '2018-02-20T00:04:00Z',
      };
      // Init trader
      const trader = new TraderWorker(traderConf);
      logger.silent = true;
      await trader.init();
      await trader.start();
      await trader.stop();
      logger.silent = false;

      // Check portfolio coherence
      chai.expect(trader.trader.portfolio.indicators.currentCapital).equal(traderConf.capital);
      chai.expect(trader.trader.portfolio.indicators.currentProfit).equal(0);
      chai.expect(trader.trader.portfolio.indicators.fees).equal(0);
      chai.expect(trader.trader.portfolio.indicators.totalValue).equal(traderConf.capital);
    }
    testit().then(() => done());
  });*/

  it('Create and run a trader doing a buy and a sell (BTC/USDT)', done => {
    async function testit() {
      const traderConf = getTraderConfig('wait');
      traderConf.env.backtest = {
        start: '2018-02-20T00:00:00Z',
        stop: '2018-02-20T00:04:00Z',
      };
      // Init trader
      const trader = new Trader(traderConf);
      logger.silent = true;
      await trader.init();
      // Change strategy
      let i = 0;
      trader.strategy.run = async (candleSet: CandleSet, trader: Trader, stratOpts: any) => {
        if (i === 0) return 'buy';
        if (i === 5) return 'sell';
        i++;
        return 'wait';
      };
      trader.strategy.after = async (candleSet: CandleSet, trader: Trader, stratOpts: any) => {
        if (i === 1) {
          chai.expect(trader.portfolio.trade).exist;
          chai.expect(trader.portfolio.trade!.orderSell).undefined;
        }
        if (i === 6) {
          chai.expect(trader.portfolio.trade).undefined;
          chai.expect(trader.portfolio.tradeHistory.length).equal(1);
        }
      };
      await trader.start();
      await trader.stop();
      logger.silent = false;

      // Check portfolio coherence
      chai.expect(trader.portfolio.indicators.currentCapital).not.equal(traderConf.capital);
      chai.expect(trader.portfolio.indicators.currentProfit).not.equal(0);
      chai.expect(trader.portfolio.indicators.fees).not.equal(0);
      chai.expect(trader.portfolio.indicators.totalValue).not.equal(traderConf.capital);
    }
    testit().then(() => done());
  });

  after(async () => {});
});
