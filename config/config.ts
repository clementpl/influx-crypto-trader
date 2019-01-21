interface Config {
  log: {
    logPath: string;
    errorPath: string;
  };
  influx: {
    host: string;
    port: number;
    stockDatabase: string;
    eventDatabase: string;
    traderDatabase: string;
  };
  mongo: {
    host: string;
    port: number;
    database: string;
  };
  api: {
    host: string;
    port: number;
  };
}

/* tslint:disable */
function getConfig(): Config {
  switch (process.env.NODE_ENV) {
    case 'PROD':
      return require('./config-prod.json');
    case 'TEST':
      return require('./config-test.json');
    default:
      return require('./config-dev.json');
  }
}

export const config: Config = getConfig();
