import * as moment from 'moment';
import { config } from '@config/config';
import { logger } from '@src/logger';
import { Influx, OHLCVTags, OHLCV } from '@core/Influx/Influx';
import { sleep } from '@core/helpers';
import { CandleSet } from './CandleSet';
import { Candle } from '@src/_core/Env/Candle';

export interface PluginConfig {
  label: string;
  opts: { name: string; [name: string]: any };
}

export interface EnvConfig {
  watchList: OHLCVTags[]; // List of currency to watch, base/quote/exchange
  batchSize?: number; // Number of candle Fetch every request
  bufferSize?: number; // CandleSet bufferSize
  warmup?: number; // warmup candles (number of previous candle to fetch)
  backtest?: {
    start: string;
    stop: string;
  };
  // Array with candle aggregated timeserie to build when making candleSet
  // ['15m', 1h', '2h'] will aggregate 3 candle serie (15min, 1hour, 2hour) on top of the minute based serie
  // At each minutes you receive the updated candle (time didn't change but value does)
  aggTimes: string[];
  // Indicator plugins
  candleSetPlugins?: Array<{ label: string; opts: { name: string; [name: string]: any } }>;
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
    this.conf.batchSize = this.conf.batchSize || 10000;
    this.conf.warmup = this.conf.warmup || 10000;
    this.candleSet = new CandleSet({
      bufferSize: conf.bufferSize || 500,
      indicators: conf.candleSetPlugins || [],
      aggTimes: conf.aggTimes || [],
    });
  }

  public async init(): Promise<Influx> {
    if (this.influx) return this.influx;
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
  public async *getGenerator() {
    try {
      if (this.conf.backtest) {
        const { start, stop } = this.conf.backtest;
        await this.loadWarmup(start, this.conf.warmup!);
        // tslint:disable-next-line
        yield* await this.backtest(start, stop);
      } else {
        await this.loadWarmup(moment(), this.conf.warmup!);
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
   * @param {number} [refresh=10]
   * @memberof Env
   */
  private async *streaming(refresh: number = 10) {
    try {
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
            limit: batchSize,
            since: since.utc().format(),
          });
          const { indicators, ...lastValue } = this.candleSet.getLast(Env.makeSymbol(tags)) as Candle;
          // Update data (if data fetched AND price coherence)
          if (ret && ret.length > 0) {
            const newValue = ret[ret.length - 1];
            // Calculate priceChange (for coherence)
            const priceChange = lastValue ? Math.abs(lastValue.close - newValue.close) / lastValue.close : 0;
            // Check if new value inserted
            if (priceChange < 0.5 && JSON.stringify(newValue) !== JSON.stringify(lastValue)) {
              await this.candleSet.push(ret, Env.makeSymbol(tags));
              hasUpdate = true;
            }
            // Log priceChange error
            else if (priceChange > 0.5) {
              logger.info(
                `[STREAMING] Price change problem (${priceChange})\n newVal: ${JSON.stringify(
                  newValue
                )}\n oldVal: ${JSON.stringify(lastValue)}`
              );
            }
          } else {
            logger.info(
              `[STREAMING] No data fetched since ${
                lastValue
                  ? moment(lastValue.time)
                      .utc()
                      .format()
                  : undefined
              }`
            );
          }
        }
        // Yield only if new data detected
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
    // load warmup size data point (stricly before start)
    start = moment(start).subtract(1, 'm');
    const batchSize = this.conf.batchSize as number;
    try {
      for (const tags of this.conf.watchList) {
        // copy warmup (enable warmup for each currency)
        let warm = warmup;
        // start fetching data (by batch of 10000)
        const since = start.subtract(warm, 'm');
        while (warm > 0) {
          // fetch data
          const ret = await this.influx.getOHLC(tags, {
            aggregatedTime: '1m',
            limit: warm > batchSize ? batchSize : warm,
            since: since.utc().format(),
          });
          await this.candleSet.push(ret, Env.makeSymbol(tags));
          warm -= batchSize;
          since.add(batchSize, 'm');
        }
      }
    } catch (error) {
      logger.error(error);
      throw new Error('Problem while fetching warmup');
    }
  }
}
