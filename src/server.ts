import { Server } from '@hapi/hapi';
import { logger } from './logger';
import { Mongo } from '@core/Mongo/Mongo';
import { config } from '../config/config';
import { API } from './api/API';

async function init(): Promise<void> {
  await Mongo.connect(config.mongo);
}

export async function startServer(): Promise<Server> {
  try {
    await init();
    // Create server API
    const server = await API.create({
      host: config.api.host,
      port: config.api.port,
    });
    return server;
  } catch (error) {
    logger.error(error);
    throw error;
  }
}

export async function stopServer(): Promise<void> {
  logger.info('Shutting down server...');
  await API.stop();
  await Mongo.close();
}
