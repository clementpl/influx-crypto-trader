import runEnv from './EnvBench';
import runTrader from './TraderBench';

async function main() {
  await runEnv();
  await runTrader();
}

main();
