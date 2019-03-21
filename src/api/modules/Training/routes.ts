import * as Joi from 'joi';
import { Training } from './Training';

const traderPayload: any = {
  name: Joi.string().required(),
  test: Joi.boolean(),
  capital: Joi.number().required(),
  percentInvest: Joi.number().required(),
  base: Joi.string().required(),
  quote: Joi.string().required(),
  env: {
    watchList: Joi.any().required(),
    warmup: Joi.number().optional(),
    batchSize: Joi.number().optional(),
    bufferSize: Joi.number().optional(),
    backtest: {
      start: Joi.string().required(),
      stop: Joi.string().required(),
    },
    aggTimes: Joi.array().optional(),
    candleSetPlugins: Joi.array().optional(),
  },
  exchange: {
    name: Joi.string().required(),
    apiKey: Joi.string(),
    apiSecret: Joi.string(),
  },
};

export const routes: any[] = [
  {
    method: 'GET',
    path: '/training',
    handler: Training.getAlgorithm,
    options: {
      tags: ['Training', 'API'],
      description: 'GET Fetch training algorithms available',
    },
  },
  {
    method: 'POST',
    path: '/training',
    handler: Training.trainTrader,
    options: {
      validate: {
        payload: {
          trader: traderPayload,
          training: {
            type: Joi.string().required(),
            opts: Joi.any().required(),
          },
        },
      },
      tags: ['Training', 'API'],
      description: 'POST Train trader with the given configuration/algorithm',
    },
  },
];
