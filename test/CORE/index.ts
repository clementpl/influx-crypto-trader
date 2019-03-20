//Require the dev-dependencies
import * as chai from 'chai';
import { Trader } from '@src/exports';
import { getTraderConfig } from '../helpers';

// chai.should();
// chai.use(require('chai-http'));

//Our parent block
describe('Core', () => {
  // beforeEach
  before(async () => {});

  /*
   * Test traderWorker
   */
  describe('Trader', () => {
    before(async () => {});

    it('Create and run a trader doing a wait strategy (BTC/USDT)', done => {
      async function testit() {
        const traderConf = getTraderConfig('wait');
        const trader = new Trader(traderConf);
        await trader.init();
        await trader.start();
        await trader.stop();
        chai.expect(trader.portfolio.indicators.currentCapital).equal(traderConf.capital);
        chai.expect(trader.portfolio.indicators.currentProfit).equal(0);
        chai.expect(trader.portfolio.indicators.fees).equal(0);
        chai.expect(trader.portfolio.indicators.totalValue).equal(traderConf.capital);
      }
      testit().then(() => done());
    });

    after(async () => {});
  });

  // After each
  after(async () => {});
});
