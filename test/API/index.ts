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

  it('Get traders (should fetch 0 traders)', done => {
    chai
      .request(server.listener)
      .get('/traders')
      .end((err: any, res: any) => {
        res.should.have.status(200);
        chai.expect(res.body.length).equal(0);
        done();
      });
  });

  it('Create a new trader and backtest it on 5 minutes (BTC/USDT)', done => {
    const traderConf = getTraderConfig('wait');
    traderConf.silent = true;
    traderConf.persist = false;
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

  it('Create a trader (streaming)', done => {
    const traderConf = getTraderConfig('wait');
    traderConf.name = 'test_streaming';
    traderConf.silent = true;
    traderConf.persist = true;
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
        await sleep(3000);
        let resp = await chai.request(server.listener).get('/traders');
        chai.expect(resp.body.length).equal(1);
        chai.expect(resp.body[0].status).equal('RUNNING');
        done();
      });
  });

  it('Fetch trader test_streaming', done => {
    const traderConfName = 'test_streaming';
    chai
      .request(server.listener)
      .get(`/traders/${traderConfName}`)
      .end(async (err, res) => {
        res.should.have.status(200);
        chai.expect(res.body.status).equal('RUNNING');
        done();
      });
  });

  it('Delete trader test_streaming', done => {
    const traderConfName = 'test_streaming';
    // delete it
    chai
      .request(server.listener)
      .del(`/traders/${traderConfName}`)
      .end(async (err, res) => {
        res.should.have.status(200);
        // Check if trader delete from mongo
        const resp = await chai.request(server.listener).get('/traders');
        chai.expect(resp.body.length).equal(0);
        done();
      });
  });

  after(async () => {
    await stopServer();
    logger.silent = false;
  });
});
