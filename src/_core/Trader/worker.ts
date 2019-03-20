import { TraderConfig, Trader } from './Trader';
import { deepFind } from '../helpers';
import { Mongo } from '@src/_core/Mongo/Mongo';
import { config as projectConfig } from '@config/config';

/**
 * Helper send error to master process
 *
 * @param {string} command
 * @returns
 */
function errorHandler(command: string) {
  return (error: Error) => {
    send(command, -1, JSON.stringify(error, Object.getOwnPropertyNames(error)));
  };
}

/**
 * Helper format message before sending to master process
 *
 * @param {string} command
 * @param {number} code
 * @param {*} msg
 */
function send(command: string, code: number, msg: any) {
  process.send!(
    JSON.stringify({
      command,
      code,
      args: msg,
    })
  );
}

/**
 * Main function
 */
async function main() {
  // Main, init trader var in main scope
  let trader: Trader;

  // Process message from master and dispatch the command to the good function
  process.on('message', async msg => {
    const { command, args } = JSON.parse(msg);
    if (!trader && command !== 'INIT') {
      errorHandler(command)(new Error(`No trader exist, can't execute command [${command}], use INIT command before`));
    } else {
      switch (command) {
        case 'INIT':
          init(args).catch(errorHandler(command));
          break;
        case 'START':
          start().catch(errorHandler(command));
          break;
        case 'STOP':
          stop().catch(errorHandler(command));
          break;
        case 'DELETE':
          delet().catch(errorHandler(command));
          break;
        case 'STATUS':
          status();
          break;
        case 'GET':
          get(args);
          break;
        default:
          errorHandler(command)(new Error(`Command [${command}] doesn't exist`));
      }
    }
  });

  /**
   * Helper send trader status to master
   */
  function status() {
    const command = 'STATUS';
    send(command, 1, trader.status);
  }

  function get(path: string) {
    const command = 'GET';
    const result: any = deepFind(trader, path);
    send(command, 1, result);
  }

  /**
   * Helper init trader then respond to master
   * @param {TraderConfig} config
   */
  async function init(config: TraderConfig) {
    const command = 'INIT';
    try {
      await Mongo.connect(projectConfig.mongo);
      if (trader) {
        await trader.stop();
      }
      trader = new Trader(config);
      await trader.init();
      send(command, 1, trader);
    } catch (error) {
      throw error;
    }
  }

  /**
   * Helper start trader, notify when finish
   */
  async function start() {
    const command = 'START';
    try {
      await trader.start();
      send(command, 1, trader);
    } catch (error) {
      throw error;
    }
  }

  /**
   * Helper stop trader, notify when finish
   */
  async function stop() {
    const command = 'STOP';
    try {
      await trader.stop();
      await Mongo.close();
      send(command, 1, trader);
    } catch (error) {
      throw error;
    }
  }

  /**
   * Helper delete trader, notify when finish
   */
  async function delet() {
    const command = 'DELETE';
    try {
      await trader.stop();
      await trader.delete();
      await Mongo.close();
      send(command, 1, trader);
    } catch (error) {
      throw error;
    }
  }
}

main().catch(errorHandler('main'));
