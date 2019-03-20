// import * as chai from 'chai';
import { logger } from '../src/logger';

logger.silent = false;
// chai.should();

function importTest(name: string, path: string): void {
  describe(name, function() {
    require(path);
  });
}

describe('UNIT TEST', () => {
  importTest('CORE', './CORE/index.ts');
  // importTest('API', './API/index.ts');
});
