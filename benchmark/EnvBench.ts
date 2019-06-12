import { logger } from '@src/logger';
import { TraderConfig, CandleSet, Env } from '@src/exports';
import { getTraderConfig, benchmark } from './helpers';

async function run() {
  // Run ENV Benchmark
  await benchmark('ENV', async () => {
    logger.silent = true;
    const traderConfig: TraderConfig = getTraderConfig('Benchmark/MACD');
    // traderConfig.env.backtest = { start: '2018-05-01T00:00:00Z', stop: '2018-10-10T00:00:00Z' };
    const env = new Env(traderConfig.env);
    await benchmark('[ENV] INIT', async () => env.init());
    const fetcher: AsyncIterator<CandleSet> = env.getGenerator();
    await benchmark('[ENV] RUN', async () => {
      let done = false;
      while (!done) {
        const data = await fetcher.next();
        done = data.done;
      }
    });
    logger.silent = false;
  });
}

export default run;
