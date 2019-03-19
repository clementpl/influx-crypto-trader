import * as moment from 'moment';
import { InfluxDB } from 'influx';
import { logger } from '@src/logger';
import { MEASUREMENT_OHLC } from './constants';
import { tagsToString, getSinceFromNow, getStop, tagsToRegexp, filterNaN } from './helpers';

export interface InfluxConfig {
  host: string;
  port: number;
  stockDatabase: string;
  eventDatabase: string;
  traderDatabase: string;
}

export interface OHLCV {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface OHLCVTags {
  base: string;
  quote: string;
  exchange: string;
  [key: string]: string;
}

export interface OHLCVOpts {
  aggregatedTime?: string;
  limit?: number;
  since?: string;
  [key: string]: any;
}

export class Influx {
  private influx: InfluxDB;

  constructor(public conf: InfluxConfig) {
    this.influx = new InfluxDB({
      host: this.conf.host,
      port: this.conf.port,
    });
  }

  public async init() {
    try {
      // check connection
      await this.createDatabaseIfNotExist(this.conf.traderDatabase);
      logger.info(`[INFLUXDB] Connection successful: ${this.conf.host}:${this.conf.port}`);
    } catch (error) {
      logger.error(new Error(`[INFLUXDB] Connection error: ${this.conf.host}:${this.conf.port}`));
      throw error;
    }
  }

  public async dropSerie(measurement: string, tags: { [name: string]: any }) {
    await this.influx.query(`DROP SERIES FROM "${measurement}" WHERE ${tagsToString(tags)}`, {
      database: this.conf.traderDatabase,
    });
  }

  public async dropSerieRegex(measurement: string, tags: { [name: string]: any }) {
    await this.influx.query(`DROP SERIES FROM "${measurement}" WHERE ${tagsToRegexp(tags)}`, {
      database: this.conf.traderDatabase,
    });
  }

  /**
   * Write OHLCV points to influxdb
   *
   * @param {{ [name: string]: any }} tags Tag of the serie (currently just the symbol, maybe more later)
   * @param {{ [name: string]: any }} data
   * @param {number} timestamp
   * @memberof Influx
   */
  public async writeData(tags: { [name: string]: any }, data: Array<{ [name: string]: any }>, measurement: string) {
    if (data && data.length > 0) {
      await this.influx
        .writePoints(
          data.map(el => ({
            measurement,
            tags,
            fields: filterNaN(el.values),
            timestamp: el.time,
          })),
          {
            database: this.conf.traderDatabase,
            precision: 'ms',
          }
        )
        .catch(error => {
          logger.error(error);
          throw new Error('Error while writing point');
        });
    }
  }

  /**
   * Get OHLC from influx db group by the specified aggregation time (minutes by default)
   *
   * @param {{ symbol: string }} tags
   * @param {string} [aggregatedTime='1m'] // influxdb units: m (minutes), d (days)
   * @memberof Influx
   */
  public async getOHLC(tags: OHLCVTags, opts: OHLCVOpts = {}): Promise<OHLCV[]> {
    try {
      const aggregatedTime = opts.aggregatedTime || '1m';
      const limit = opts.limit || 500;
      opts.since = opts.since || getSinceFromNow(aggregatedTime, limit);
      const firstPointsTimestamp = await this.getFirstTimestamp(this.conf.stockDatabase, MEASUREMENT_OHLC, tags);
      const since =
        firstPointsTimestamp > new Date(opts.since).getTime()
          ? moment(firstPointsTimestamp)
              .utc()
              .format()
          : opts.since;
      const ret: any = await this.influx.query(
        `SELECT first(open) as open, max(high) as high, min(low) as low, last(close) as close, sum(volume) as volume
         FROM ${MEASUREMENT_OHLC}
         WHERE ${tagsToString(tags)} AND time >= '${since}' AND time < '${getStop(since, limit)}'
         GROUP BY time(${aggregatedTime}) fill(none) limit ${limit + 1}`,
        {
          database: this.conf.stockDatabase,
        }
      );
      return ret.map((el: any) => ({
        time: new Date(el.time.toString()).getTime(),
        open: +el.open,
        high: +el.high,
        low: +el.low,
        close: +el.close,
        volume: +el.volume,
      }));
    } catch (error) {
      logger.error(error);
      throw new Error('Problem while fetching OHLC data');
    }
  }

  /**
   * Check if given database name exist. If not create it.
   *
   * @private
   * @param {string} name
   * @memberof Influx
   */
  private async createDatabaseIfNotExist(name: string) {
    try {
      const databases: string[] = await this.influx.getDatabaseNames();
      // If not exist create it
      if (!databases.includes(name)) await this.influx.createDatabase(name);
    } catch (error) {
      throw error;
    }
  }

  private async getFirstTimestamp(database: string, serie: string, tags: any) {
    const ret: any = await this.influx
      .query(`SELECT * FROM ${serie} WHERE ${tagsToString(tags)} GROUP BY * ORDER BY ASC LIMIT 1`, { database })
      .catch(error => {
        logger.error(error);
        throw new Error('Problem while fetching first point of the serie');
      });
    return new Date(ret[0].time.toString()).getTime();
  }
}
