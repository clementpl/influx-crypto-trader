import runEnv from './EnvBench';
import runTrader from './TraderBench';

async function main() {
  await runEnv();
  await runTrader();
}

// tslint:disable-next-line
main().catch(error => console.log(error));
