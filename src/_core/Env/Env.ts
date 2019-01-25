import * as moment from 'moment';
import { CandleSet } from './CandleSet';
import { Influx, OHLCVTags, OHLCV } from '../Influx/Influx';
import { config } from '../../../config/config';
import { logger } from '../../logger';
import { sleep } from '../helpers';

export interface EnvConfig {
  watchList: OHLCVTags[]; // Default aggTime = '1m'
  batchSize?: number; // Number of candle Fetch every request
  bufferSize?: number; // CandleSet bufferSize
  warmup?: number; // warmup candles (number of previous candle to fetch)
  backtest?: {
    start: string;
    stop: string;
  };
  candleSetPlugins?: Array<{ label: string; opts: { [name: string]: string } }>;
}

export class Env {
  /**
   * Helper make symbol of the crypto series from tags and aggTime
   *
   * @static
   * @param {OHLCVTags} tags
   * @param {string} aggTime
   * @returns {string}
   * @memberof Env
   */
  public static makeSymbol(tags: OHLCVTags): string {
    return `${tags.exchange}:${tags.base}:${tags.quote}`;
  }

  private influx: Influx;
  private candleSet: CandleSet;
  private shouldStop: boolean;

  constructor(public conf: EnvConfig) {
    this.conf.batchSize = this.conf.batchSize || 500;
    this.conf.warmup = this.conf.warmup || 500;
    this.candleSet = new CandleSet({
      bufferSize: conf.bufferSize || 5000,
      indicators: conf.candleSetPlugins || [],
    });
  }

  public async init(): Promise<Influx> {
    this.influx = new Influx(config.influx);
    await this.influx.init().catch(error => {
      throw error;
    });
    return this.influx;
  }

  /**
   * Get the generator environnement (backtest or streaming)
   *
   * @returns {*}
   * @memberof Env
   */
  public async *getGenerator(): any {
    try {
      if (this.conf.backtest) {
        const { start, stop } = this.conf.backtest;
        // tslint:disable-next-line
        yield* await this.backtest(start, stop);
      } else {
        // tslint:disable-next-line
        yield* await this.streaming();
      }
    } catch (error) {
      logger.error(error);
    }
  }

  /**
   * Stop the env (if running)
   *
   * @memberof Env
   */
  public stop() {
    this.shouldStop = false;
  }

  /**
   * Run the environnement in streaming mode
   *
   * @private
   * @param {number} [refresh=20]
   * @memberof Env
   */
  private async *streaming(refresh: number = 20) {
    try {
      // Load Warmup
      await this.loadWarmup(moment(), <any>this.conf.warmup);

      // Start streaming loop
      const batchSize = 5;
      while (!this.shouldStop) {
        let hasUpdate = false;
        // For each market to watch
        for (const tags of this.conf.watchList) {
          const since = moment().subtract(batchSize, 'm');
          // fetch data
          const ret = await this.influx.getOHLC(tags, {
            aggregatedTime: '1m',
            limit: batchSize, // this.conf.batchSize,
            since: since.utc().format(),
          });
          // Update data
          const lastValue = this.candleSet.getLast(Env.makeSymbol(tags));
          await this.candleSet.push(ret, Env.makeSymbol(tags));
          const newValue = this.candleSet.getLast(Env.makeSymbol(tags));
          if (JSON.stringify(newValue) !== JSON.stringify(lastValue)) {
            hasUpdate = true;
          }
        }
        // Yield only in new data detected
        if (hasUpdate) {
          yield this.candleSet;
        }
        // Sleep refreshInterval
        await sleep(refresh * 1000);
      }
    } catch (error) {
      logger.error(error);
      // TODO => sell open order, send mail, then stop
      throw new Error('Problem while streaming');
    }
  }

  /**
   * Run the environement in backtest mode
   *
   * @private
   * @param {string} start
   * @param {string} stop
   * @memberof Env
   */
  private async *backtest(start: string, stop: string) {
    try {
      // Load Warmup
      await this.loadWarmup(start, <any>this.conf.warmup);
      // Start backtest loop
      const current = moment(start);
      const end = moment(stop);
      // Helper get limit candles to fetch (when currentStep + limit > endDate then return the good limit)
      const getLimit = () => {
        if (
          moment(current)
            .add(this.conf.batchSize, 'm')
            .diff(end, 'm') > 0
        ) {
          return moment(current).diff(end, 'm') * -1;
        }
        return this.conf.batchSize;
      };

      while (!this.shouldStop && current.diff(end) < 0) {
        // Set buffer to store candle fetch for each market
        const buffer: Array<{ symbol: string; data: OHLCV[] }> = [];
        // For each market to watch
        for (const tags of this.conf.watchList) {
          const since = moment(current);
          // fetch data
          const ret = await this.influx.getOHLC(tags, {
            aggregatedTime: '1m',
            limit: getLimit(),
            since: since.utc().format(),
          });
          buffer.push({ symbol: Env.makeSymbol(tags), data: ret });
        }
        // Loop over buffer data to push candle one by one
        const mainData = buffer[0].data;
        for (let i = 0; i < mainData.length; i++) {
          // Loop over market to set the new candle to each market before yielding
          for (const market of buffer) {
            await this.candleSet.push(market.data[i], market.symbol);
          }
          // Yield candleSet with new candle added
          yield this.candleSet;
        }
        // Go to next batch
        current.add(this.conf.batchSize, 'm');
      }
    } catch (error) {
      logger.error(error);
      throw new Error('Problem while backtesting');
    }
  }

  /**
   * Load warmup candles
   *
   * @private
   * @param {(string | moment.Moment)} start
   * @param {number} warmup
   * @memberof Env
   */
  private async loadWarmup(start: string | moment.Moment, warmup: number): Promise<void> {
    start = moment(start);
    try {
      for (const tags of this.conf.watchList) {
        const batchSize = 1000;
        // start fetching data (by batch of 1000)
        const since = start.subtract(warmup, 'm');
        while (warmup > 0) {
          // fetch data
          const ret = await this.influx.getOHLC(tags, {
            aggregatedTime: '1m',
            limit: warmup > batchSize ? batchSize : warmup,
            since: since.utc().format(),
          });
          await this.candleSet.push(ret, Env.makeSymbol(tags));
          warmup -= batchSize;
          since.add(batchSize, 'm');
        }
      }
    } catch (error) {
      logger.error(error);
      throw new Error('Problem while fetching warmup');
    }
  }
}
