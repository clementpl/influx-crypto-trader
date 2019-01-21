import { logger } from './logger';
import { stopServer, startServer } from './server';

startServer().catch(error => logger.error(error));

/* tslint:disable */
// Catch SIGINT/SIGNTERM/KILL ,...
require('death')(async () => {
  await stopServer();
});
