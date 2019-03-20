import { logger } from '../src/logger';

logger.silent = false;

function importTest(name: string, path: string[]): void {
  describe(name, function() {
    path.forEach(p => require(p));
  });
}

describe('UNIT TEST', () => {
  importTest('CORE', ['./CORE/trader.ts', './CORE/indicators.ts']);
  // importTest('API', './API/index.ts');
});
