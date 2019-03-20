//Require the dev-dependencies
import * as chai from 'chai';
import { startServer, stopServer } from '@src/server';
import { getTraderConfig } from '../helpers';
import { sleep } from '@src/_core/helpers';
import { logger } from '@src/logger';

chai.should();
chai.use(require('chai-http'));
let server: any;

/*
 * Test route /traders CRUD
 */
describe('CRUD Traders', () => {
  before(async () => {
    logger.silent = true;
    return (server = await startServer());
  });

  it('it should get 0 traders', done => {
    chai
      .request(server.listener)
      .get('/traders')
      .end((err: any, res: any) => {
        res.should.have.status(200);
        chai.expect(res.body.length).equal(0);
        done();
      });
  });

  it('it should create a new trader and backtest it on 5 minutes (BTC/USDT)', done => {
    const traderConf = getTraderConfig('wait');
    traderConf.silent = true;
    traderConf.env.backtest = {
      start: '2018-02-20T00:00:00Z',
      stop: '2018-02-20T00:04:00Z',
    };
    chai
      .request(server.listener)
      .post('/traders')
      .send(traderConf)
      .end((err: any, res: any) => {
        res.should.have.status(200);
        res.body.msg.should.be.a('string');
        chai.expect(res.body.msg).equal(traderConf.name);
        done();
      });
  });

  it('it should create a new trader streaming', done => {
    const traderConf = getTraderConfig('wait');
    traderConf.name = 'test_streaming';
    traderConf.silent = true;
    traderConf.env.backtest = undefined;
    chai
      .request(server.listener)
      .post('/traders')
      .send(traderConf)
      .end(async (err: any, res: any) => {
        res.should.have.status(200);
        res.body.msg.should.be.a('string');
        chai.expect(res.body.msg).equal(traderConf.name);
        // Check if trader created in mongo
        await sleep(1000);
        let resp = await chai.request(server.listener).get('/traders');
        chai.expect(resp.body.length).equal(1);
        chai.expect(resp.body[0].status).equal('RUNNING');
        // delete it
        await chai.request(server.listener).del(`/traders/${traderConf.name}`);
        // Check if trader delete from mongo
        resp = await chai.request(server.listener).get('/traders');
        chai.expect(resp.body.length).equal(0);

        done();
      });
  });

  /*
    it('it should fetch 2 watchers running', done => {});

    it('it should stop every watchers', done => {});

    it('it should restart every watchers', done => {});

    it('it should delete every watchers', done => {});
    */
});

after(async () => {
  await stopServer();
  logger.silent = false;
});
