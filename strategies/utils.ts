import { linear } from 'regression';
import * as moment from 'moment';
import * as momentRandom from 'moment-random';
import { EnvConfig } from '../src/exports';

export function randomBetween(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1) + min);
}

export function getRegression(serie: number[]) {
  const result = linear(<any>serie.map((val, idx) => [idx, val]));
  // return diff linear diff
  return result.equation[0];
  // return points[points.length - 2][1] - points[points.length - 3][1];
}

/**
 * Shuffles array in place. ES6 version
 * @param {Array} a items An array containing the items.
 */
export function shuffle(a: any[]) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function getEnvLength(env: EnvConfig): number {
  // disable typescript compil warning => field backtest?
  env.backtest = env.backtest || { start: '', stop: '' };
  const { start, stop } = env.backtest;
  return Math.abs(moment(start).diff(moment(stop), 'm'));
}

export function splitBacktestEnv(env: EnvConfig, split: number) {
  // disable typescript compil warning => field backtest?
  env.backtest = env.backtest || { start: '', stop: '' };
  const start = moment(env.backtest.start);
  const stop = moment(env.backtest.stop);
  const envLength = stop.diff(start, 'm');
  const middleDate = moment(start).add(Math.floor(envLength * split), 'm');
  const trainEnv: EnvConfig = {
    ...env,
    backtest: {
      start: env.backtest.start,
      stop: middleDate.format(),
    },
  };
  const testEnv: EnvConfig = {
    ...env,
    backtest: {
      // left a gap between train and test set (2% of the total number of minutes)
      start: middleDate.add(Math.floor(envLength * 0.02), 'm').format(),
      stop: env.backtest.stop,
    },
  };
  return [trainEnv, testEnv];
}

// helpers select random date range between 2 dates
export function selectRandomEnv(begin: string, end: string, length: number) {
  // Generate random start date
  const fmt = (date: moment.Moment) => date.format('YYYY-MM-DDTHH:mm:00');
  const stopLimit = moment(end).subtract(length, 'm');
  const newStart = momentRandom(stopLimit, moment(begin));
  return [fmt(newStart), fmt(newStart.add(length, 'm'))];
}
