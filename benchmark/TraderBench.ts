import { getTraderConfig, benchmark } from './helpers';
import { TraderConfig, Trader, logger } from '@src/exports';

async function run() {
  // Run MACD Benchmark
  await benchmark('TRADER', async () => {
    logger.silent = true;
    const traderConfig: TraderConfig = getTraderConfig('Benchmark/MACD');
    const trader = new Trader(traderConfig);
    await benchmark('[TRADER] INIT', async () => trader.init());
    await benchmark('[TRADER] START', async () => trader.start());
    await benchmark('[TRADER] STOP', async () => trader.stop());
    logger.silent = false;
  });
}

export default run;
