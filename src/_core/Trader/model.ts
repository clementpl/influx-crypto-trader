import { Schema, model, Document } from 'mongoose';
import { EnvConfig } from '@src/_core/Env/Env';
import { TraderConfig } from '@src/_core/Trader/Trader';

// Create trader schema
const TraderSchema = new Schema(
  {
    name: String,
    silent: Boolean,
    status: String,
    strategie: String,
    capital: Number,
    percentInvest: Number,
    test: Boolean,
    flush: Boolean,
    base: String,
    quote: String,
    exchange: {
      name: String,
      apiKey: String,
      apiSecret: String,
    },
    env: {
      watchList: Array,
      batchSize: Number,
      bufferSize: Number,
      warmup: Number,
      backtest: {
        start: String,
        stop: String,
      },
    },
    stratOpts: Schema.Types.Mixed,
    // ...any
    // Strict:false => enable storing any other props
  },
  { strict: false }
);

export interface TraderModel extends Document {
  id?: string;
  type: string;
  status: string;

  name: string;
  silent: boolean;
  strategie: string;
  capital: number;
  percentInvest: number;
  test: boolean;
  flush: boolean;
  restart: boolean;
  quote: string;
  exchange: {
    name: string;
    apiKey: string;
    apiSecret: string;
  };
  env: EnvConfig;
  stratOpts: any;
}

// Export Trader model
export const TraderModel = model<TraderModel>('Trader', TraderSchema);
