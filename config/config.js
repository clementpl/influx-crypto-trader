"use strict";
exports.__esModule = true;
/* tslint:disable */
function getConfig() {
    switch (process.env.NODE_ENV) {
        case 'PROD':
            return require('./config-prod.json');
        case 'TEST':
            return require('./config-test.json');
        default:
            return require('./config-dev.json');
    }
}
exports.config = getConfig();
