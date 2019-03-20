import { fork, ChildProcess } from 'child_process';
import { TraderConfig, Trader } from './Trader';

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
  // Trader child process
  private traderProcess: ChildProcess;
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
    this.traderProcess = fork(__dirname + '/worker.ts', [], {
      silent: this.opts.silent,
      execArgv: ['-r', 'ts-node/register', '-r', 'tsconfig-paths/register'],
    });
    // Dispatch response command
    this.traderProcess.on('message', msg => {
      const { command, code, args } = JSON.parse(msg);
      const resolver = this.resolver[command];
      // Resolve promise for command response
      // UPDATE trader ref (for properties, stat...) if args is trader
      this.trader = args.config && args.config.name && args.config.exchange ? args : this.trader;
      // STOP special behavior
      if (command === 'STOP' || command === 'DELETE') {
        this.traderProcess.kill();
      }
      // Default behavior
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
    this.send('STOP');
    return this.addResolver('STOP');
  }

  /**
   * Delete the trader (mongo/influx)
   *
   * @returns {Promise<any>}
   * @memberof TraderWorker
   */
  public async delete(): Promise<any> {
    this.send('DELETE');
    return this.addResolver('DELETE');
  }

  /**
   * Start the trader
   *
   * @returns {Promise<any>}
   * @memberof TraderWorker
   */
  public async start(): Promise<any> {
    this.send('START');
    return this.addResolver('START');
  }

  /**
   * Get a specific trader property
   *
   * @param {string} path
   * @returns {Promise<any>}
   * @memberof TraderWorker
   */
  public async get(path: string): Promise<any> {
    this.send('GET', path);
    return this.addResolver('GET');
  }

  /**
   * Get trader status
   *
   * @returns {Promise<any>}
   * @memberof TraderWorker
   */
  public async getStatus(): Promise<any> {
    this.send('STATUS');
    return this.addResolver('STATUS');
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
    if (!this.traderProcess) throw Error(`No trader process running ${this.config.name} (should init first)`);
    this.traderProcess.send(payload);
  }

  /**
   * Add a command resolver (when child process respond the promise will resolve)
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
