import { existsSync } from 'fs';
import { Request } from 'hapi';
import * as Boom from 'boom';
import { logger, TraderConfig, TraderWorker, Status, TraderModel } from '../../../../src/exports';
import { success } from '../../helpers';
import { Optimizer } from './Optimizer';
import { MEASUREMENT_PORTFOLIO, MEASUREMENT_TRADES, Influx } from '@src/_core/exports';
import { config } from '@config/config';
import { PortfolioModel } from '@src/_core/Trader/Portfolio/model';

export class Traders {
  public static runningTraders: TraderWorker[] = [];

  /**
   * Fetch every trader (mongoDb)
   *
   * @static
   * @returns {Promise<any>}
   * @memberof Traders
   */
  public static async getTraders(): Promise<any> {
    try {
      const traders: TraderModel[] = await TraderModel.find();
      const portfolios: PortfolioModel[] = await PortfolioModel.find();
      return traders.map((t: any) => {
        const trader: any = t.toJSON();
        trader.portfolio = portfolios.find(p => trader.name === p.name);
        return trader;
      });
    } catch (error) {
      logger.error(error);
      throw Boom.internal(error);
    }
  }

  /**
   * Fetch the specified trader (mongoDb)
   *
   * @static
   * @param {Request} request
   * @returns {Promise<any>}
   * @memberof Traders
   */
  public static async getTrader(request: Request): Promise<any> {
    try {
      const { name } = request.params;
      let trader: any = await TraderModel.findOne({ name });
      if (!trader) {
        return Boom.notFound(`Trader ${name} not found`);
      }
      trader = trader.toJSON();
      trader.portfolio = await PortfolioModel.findOne({ name });
      return trader;
    } catch (error) {
      logger.error(error);
      throw Boom.internal(error);
    }
  }

  /**
   * Create a new trader (backtest/streaming)
   *
   * @static
   * @param {Request} request
   * @returns {Promise<any>}
   * @memberof Traders
   */
  public static async createTrader(request: Request): Promise<any> {
    // Catch error helper (init/start)
    const catchError = (trader: TraderWorker) => async (error: Error) => {
      logger.error(error);
      await trader.stop();
      Traders.removeRunnningTrader(trader);
    };

    try {
      const traderConfig = <TraderConfig>request.payload;
      const strategiePath = `${process.cwd()}/strategies/${traderConfig.strategie}.ts`;
      // if path not exist or try going outside strategie
      if (!existsSync(strategiePath)) {
        return Boom.badRequest(`Strategy file not found at: ${strategiePath}`);
      }
      if (await TraderModel.findOne({ name: traderConfig.name })) {
        return Boom.badRequest(`Trader ${traderConfig.name} already exist`);
      }

      // Create trader worker
      const trader = new TraderWorker(traderConfig);
      // Start thread and init trader (env/portfolio/...)
      await trader.init().catch(catchError(trader));
      // Start trader (stop and delete it when finish running (backtest mode))
      trader
        .start()
        .then(async () => {
          if ((await trader.getStatus()) !== Status.STOP) await trader.stop();
          Traders.removeRunnningTrader(trader);
          logger.info(`[API] trader ${traderConfig.name} finish running`);
        })
        .catch(catchError(trader));
      // Push it to array of running traders
      Traders.runningTraders.push(trader);
      return success(traderConfig.name);
    } catch (error) {
      logger.error(error);
      throw Boom.internal(error);
    }
  }

  /**
   * Start a trader already register in mongodb
   *
   * @static
   * @param {Request} request
   * @returns {Promise<any>}
   * @memberof Traders
   */
  public static async startTrader(request: Request): Promise<any> {
    try {
      const { name } = request.params;
      const running = Traders.runningTraders.find(t => t.config.name === name);
      if (running) {
        return Boom.badRequest(`Trader ${name} already running`);
      }
      let traderMongo = await TraderModel.findOne({ name });
      if (!traderMongo) {
        return Boom.notFound(`Trader ${name} not found`);
      }
      traderMongo = traderMongo.toJSON() as TraderModel;
      traderMongo.env.backtest = traderMongo.env.backtest;
      // Modify config for restarting
      const traderConfig: any = {
        ...traderMongo,
        flush: false,
        restart: true,
      };

      // Create trader worker
      const trader = new TraderWorker(traderConfig);
      // Start thread and init trader (env/portfolio/...)
      await trader.init();
      // Start trader (stop and delete it when finish running (backtest mode))
      trader
        .start()
        .then(async () => {
          await trader.stop();
          Traders.removeRunnningTrader(trader);
          logger.info(`[API] trader ${traderConfig.name} finish running`);
        })
        .catch(async (error: Error) => {
          logger.error(error);
          await trader.stop();
          Traders.removeRunnningTrader(trader);
        });
      // Push it to array of running traders
      Traders.runningTraders.push(trader);
      return success(trader.trader.config.name);
    } catch (error) {
      logger.error(error);
      throw Boom.internal(error);
    }
  }

  /**
   * Stop a trader
   *
   * @static
   * @param {Request} request
   * @returns {Promise<any>}
   * @memberof Traders
   */
  public static async stopTrader(request: Request): Promise<any> {
    try {
      const { name } = request.params;
      const running = Traders.runningTraders.find(t => t.config.name === name);
      if (running) {
        // Stop trader
        await running.stop();
        // Remove from running
        const runningIdx = Traders.runningTraders.map(t => t.config.name).indexOf(running.config.name);
        Traders.runningTraders.splice(runningIdx, 1);
      }
      return success();
    } catch (error) {
      logger.error(error);
      throw Boom.internal(error);
    }
  }

  /**
   * Delete a trader and the data associated (mongodb + infuxdb)
   *
   * @static
   * @param {Request} request
   * @returns {Promise<any>}
   * @memberof Traders
   */
  public static async deleteTrader(request: Request): Promise<any> {
    try {
      const { name } = request.params;
      const running = Traders.runningTraders.find(t => t.config.name === name);
      // If trader is not currently running
      if (!running) {
        // Search trader in mongodb
        const trader = await TraderModel.findOne({ name });
        if (!trader) return Boom.badRequest(`Trader ${name} doesn't exist`);
        // Delete trader from influxdb + mongodb
        const influx = new Influx(config.influx);
        await influx.dropSerie(MEASUREMENT_PORTFOLIO, { name });
        await influx.dropSerie(MEASUREMENT_TRADES, { name });
        await TraderModel.deleteOne({ name });
        await PortfolioModel.deleteOne({ name });
      } else {
        // Delete trader (mongo/influx)
        await running.delete();
        Traders.removeRunnningTrader(running);
      }
      return success();
    } catch (error) {
      logger.error(error);
      throw Boom.internal(error);
    }
  }

  /**
   * Optimize trader strategy using genetic optimizer
   *
   * @static
   * @param {Request} request
   * @returns {Promise<any>}
   * @memberof Traders
   */
  public static async optimizeTrader(request: Request): Promise<any> {
    try {
      const { trader, opts } = <any>request.payload;
      Optimizer.genetic(trader, opts).catch(error => logger.error(error));
      logger.info(`[API] Genetic optimizer for ${trader.name} launch`);
      return success();
    } catch (error) {
      logger.error(error);
      throw Boom.internal(error);
    }
  }

  private static removeRunnningTrader(trader: TraderWorker): void {
    const runningIdx = Traders.runningTraders.map(t => t.config.name).indexOf(trader.config.name);
    if (runningIdx !== -1) Traders.runningTraders.splice(runningIdx, 1);
  }
}
