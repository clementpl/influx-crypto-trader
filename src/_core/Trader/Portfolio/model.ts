import { Schema, model, Document } from 'mongoose';

const portfolioSchema = new Schema(
    {
      name: String,
      capital: Number,
      base: String,
      quote: String,
      exchange: String,
      backtest: Boolean,
      indicators: {
        currentCapital: Number,
        assetCapital: Number,
        totalValue: Number,
        fees: Number,
        currentProfit: Number,
      },
      trade: {
        orderBuy: Schema.Types.Mixed,
        orderSell: Schema.Types.Mixed,
        orderProfit: Number,
      },
      indicatorHistory: [
        {
          currentCapital: Number,
          assetCapital: Number,
          totalValue: Number,
          fees: Number,
          currentProfit: Number,
        },
      ],
      tradeHistory: [
        {
          orderBuy: Schema.Types.Mixed,
          orderSell: Schema.Types.Mixed,
          orderProfit: Number,
        },
      ],
    },
    { strict: false }
  );
  
  export interface PortfolioModel extends Document {
    name: string,
  }
  
  // Export Portfolio model
  export const PortfolioModel = model<PortfolioModel>('Portfolio', portfolioSchema);
  