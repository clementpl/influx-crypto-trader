import * as Boom from 'boom';
import { logger } from '../../../logger';
import { TraderConfig, Trader, Status } from '../../../_core/Trader/Trader';
import { TraderModel } from '../../../_core/Trader/model';
import { Request } from 'hapi';
import { success } from '../../helpers';
import { existsSync } from 'fs';

export class Traders {
  public static runningTraders: Trader[] = [];

  public static async getTraders(): Promise<any> {
    try {
      const traders: TraderModel[] = await TraderModel.find();
      return traders.map((t: any) => <TraderConfig>t._doc);
    } catch (error) {
      logger.error(error);
      throw Boom.internal(error);
    }
  }

  public static async getTrader(request: Request): Promise<any> {
    try {
      const { name } = request.params;
      const trader = await TraderModel.findOne({ name });
      if (!trader) {
        return Boom.notFound(`Trader ${name} not found`);
      }
      return trader;
    } catch (error) {
      logger.error(error);
      throw Boom.internal(error);
    }
  }

  public static async createTrader(request: Request): Promise<any> {
    try {
      const traderConfig = <TraderConfig>request.payload;
      const strategiePath = `${process.cwd()}/strategies/${traderConfig.strategie}`;
      // if path not exist or try going outside strategie
      if (!existsSync(strategiePath)) {
        return Boom.badRequest(`Strategy file not found at: ${strategiePath}`);
      }
      const trader = new Trader(traderConfig);
      await trader.init();
      // Start trader (stop and delete it when finish running (backtest mode))
      trader
        .start()
        .then(async () => {
          if (trader.status !== Status.STOP) await trader.stop();
          Traders.removeRunnningTrader(trader);
          logger.info(`[API] trader ${traderConfig.name} finish running`);
        })
        .catch(async error => {
          logger.error(error);
          await trader.stop();
          Traders.removeRunnningTrader(trader);
        });
      Traders.runningTraders.push(trader);
      return success();
    } catch (error) {
      logger.error(error);
      throw Boom.internal(error);
    }
  }

  public static async deleteTrader(request: Request): Promise<any> {
    try {
      const { name } = request.params;
      const running = Traders.runningTraders.find(t => t.config.name === name);
      if (running) {
        // Delete trader (mongo/influx)
        await running.delete();
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

  private static removeRunnningTrader(trader: Trader): void {
    const runningIdx = Traders.runningTraders.map(t => t.config.name).indexOf(trader.config.name);
    if (runningIdx !== -1) Traders.runningTraders.splice(runningIdx, 1);
  }
}
