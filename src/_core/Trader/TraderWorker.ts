import { TraderConfig, Trader, Status } from './Trader';
import { deepFind } from '@src/_core/helpers';
import { Worker } from 'worker_threads';
import { logger } from '@src/logger';

/**
 * TraderWorker class help to create a trader in another process (fork) and send command to the worker using IPC
 * Command resolve as promise, meaning that the promise will wait for the worker IPC response to resolve/reject
 *
 * @export
 * @class TraderWorker
 */
export class TraderWorker {
  // Trader data reference (refresh when trader stoppped)
  public trader: Trader;
  // Trader worker thread
  private workerThread: Worker;
  private killed: boolean = false;
  // Track command response to send back (with promise)
  private resolver: { [command: string]: { resolve: any; reject: any } } = {};

  constructor(
    public config: TraderConfig,
    private opts: {
      silent: boolean;
    } = { silent: false }
  ) {
    if (config.silent) opts.silent = true;
  }

  /**
   * Create a new child process, bind message resolver to resolve command promise (this.resolver)
   * Then init the trader
   *
   * @returns {Promise<any>}
   * @memberof TraderWorker
   */
  public async init(): Promise<any> {
    this.workerThread = new Worker(__dirname + '/worker.import.js', {
      // workerData : {...}
      stdout: this.opts.silent,
    });
    this.killed = false;
    // Dispatch response command
    this.workerThread.on('message', msg => {
      // Get response
      const { command, code, args } = JSON.parse(msg);
      // Find promise to resolve
      const resolver = this.resolver[command];
      // UPDATE trader ref (for properties, stat...) if args is trader
      this.trader = args.config && args.config.name && args.config.exchange ? args : this.trader;
      // STOP special behavior
      if (command === 'STOP' || command === 'DELETE') {
        this.workerThread.terminate();
        this.killed = true;
      }
      // Default behavior (resolve promise)
      if (code === -1) {
        resolver.reject(JSON.parse(args));
      } else resolver.resolve(args);
    });

    this.send('INIT', this.config);
    return this.addResolver('INIT');
  }

  /**
   * Stop the trader
   *
   * @returns {Promise<any>}
   * @memberof TraderWorker
   */
  public async stop(): Promise<any> {
    if (!this.killed) {
      this.send('STOP');
      return this.addResolver('STOP');
    }
  }

  /**
   * Delete the trader (mongo/influx)
   *
   * @returns {Promise<any>}
   * @memberof TraderWorker
   */
  public async delete(): Promise<any> {
    if (!this.killed) {
      this.send('DELETE');
      return this.addResolver('DELETE');
    }
  }

  /**
   * Start the trader
   *
   * @returns {Promise<any>}
   * @memberof TraderWorker
   */
  public async start(): Promise<any> {
    if (!this.killed) {
      this.send('START');
      return this.addResolver('START');
    }
  }

  /**
   * Get a specific trader property
   *
   * @param {string} path
   * @returns {Promise<any>}
   * @memberof TraderWorker
   */
  public async get(path: string): Promise<any> {
    if (!this.killed) {
      this.send('GET', path);
      return this.addResolver('GET');
    }
    return deepFind(this.trader, path);
  }

  /**
   * Get trader status
   *
   * @returns {Promise<any>}
   * @memberof TraderWorker
   */
  public async getStatus(): Promise<any> {
    if (!this.killed) {
      this.send('STATUS');
      return this.addResolver('STATUS');
    }
    return Status.STOP;
  }

  /**
   * Send message to trader child process
   *
   * @private
   * @param {string} command
   * @param {*} [args]
   * @memberof TraderWorker
   */
  private send(command: string, args?: any): void {
    const payload = JSON.stringify({
      command,
      args,
    });
    // if (!this.traderProcess) throw Error(`No trader process running ${this.config.name} (should init first)`);
    if (this.workerThread) this.workerThread.postMessage(payload);
  }

  /**
   * Add a command resolver (when child process respond, the promise will resolve)
   *
   * @private
   * @param {string} command command name to resolve
   * @returns {Promise<any>}
   * @memberof TraderWorker
   */
  private async addResolver(command: string): Promise<any> {
    return new Promise((resolve, reject) => {
      this.resolver[command] = { resolve, reject };
    });
  }
}
