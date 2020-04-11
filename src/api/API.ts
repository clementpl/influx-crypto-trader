import { Server } from '@hapi/hapi';
import { logger } from '@src/logger';
import { routes } from './modules/routes';
import { Traders } from './modules/Traders/Traders';
import { Optimizer } from './modules/Traders/Optimizer';

export interface APIConfig {
  port?: number;
  host?: string;
}

const DEFAULT_API_CONFIG = {
  port: 3000,
  host: 'localhost',
};

/**
 * Static class API
 *
 * @export
 * @class API
 */
export class API {
  public static server: Server | null = null;

  /**
   * Static method create the server api (hapi.js), then bind it to the server property
   *
   * @static
   * @param {APIConfig} [conf]
   * @returns {Promise<void>}
   * @memberof API
   */
  public static async create(conf?: APIConfig): Promise<Server> {
    const config = Object.assign(DEFAULT_API_CONFIG, conf);
    try {
      // Create new Server
      const server = new Server({
        port: config.port,
        host: config.host,
        routes: { cors: true },
      });

      // Register plugins for lout (api documentation)
      await server.register([require('vision'), require('inert'), require('lout')]);

      // Load schema validator compiler
      server.validator(require('@hapi/joi'));

      // Bind routes
      routes.forEach(route => server.route(route));

      // Start the http server
      await server.start();

      // Bind server instance
      API.server = server;

      logger.info(`[API] Server running at: ${API.server.info.uri}`);
      return server;
    } catch (error) {
      logger.error(error);
      throw new Error('[API] Cannot start api');
    }
  }

  /**
   * Static method stop watchers and api, then unbind the server property
   *
   * @static
   * @returns {Promise<void>}
   * @memberof API
   */
  public static async stop(): Promise<void> {
    // If API running
    if (API.server) {
      await API.server.stop();
      API.server = null;
    }
    // Stop running traders
    Traders.runningTraders.forEach(trader => trader.stop());
    Optimizer.stop();
  }
}
