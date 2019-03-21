import { Request } from 'hapi';
import * as Boom from 'boom';
import { logger } from '@src/logger';
import { success } from '@api/helpers';
import { requireUncached } from '@core/helpers';

// Experimental, Let you run a training algortihm (machine learning)
export class Training {
  public static async getAlgorithm(): Promise<any> {
    try {
      return [{ name: 'NeuroeEvolution', opts: '...' }];
    } catch (error) {
      logger.error(error);
      throw Boom.internal(error);
    }
  }

  public static async trainTrader(request: Request): Promise<any> {
    try {
      const payload = <any>request.payload;
      if (!payload.trader.env.backtest) {
        return Boom.badRequest('Cannot train in streaming mode (set env.backtest prop)');
      }
      const runner = requireUncached(`${process.cwd()}/strategies/${payload.training.type}/run`).default;
      runner(payload.trader, payload.training.opts).then(() => logger.info(`Training finished`));

      /*
      const baseName: string = String(payload.trader.name);
      for (let i = 0; i < payload.training.episode; i++) {
        console.log('EPISODE ', i);
        payload.name = `${baseName}-ep${i}`;
        const trader = new Trader(<TraderConfig>copyObj(payload.trader));
        await trader.init();
        await trader.start();
      }
      logger.info(`Training finish for ${baseName}`);
      // trainTrader(payload);
      // Start trader (stop and delete it when finish running (backtest mode))*/
      return success();
    } catch (error) {
      logger.error(error);
      throw Boom.internal(error);
    }
  }
}
