const path = require('path');
 
require('ts-node').register();
require('tsconfig-paths').register();
require(path.resolve(__dirname, './worker.ts'));
