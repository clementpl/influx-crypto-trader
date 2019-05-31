import { Schema, model, Document } from 'mongoose';
import { PortfolioIndicators, PortfolioTrade } from '@src/_core/Trader/Portfolio/Portfolio';

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
      holdProfit: Number,
      nbTradeWin: Number,
      percentTradeWin: Number,
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
        holdProfit: Number,
        nbTradeWin: Number,
        percentTradeWin: Number,
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
  name: string;
  capital: number;
  quote: string;
  exchange: string;
  backtest: boolean;
  indicators: PortfolioIndicators;
  trade: PortfolioTrade;
  indicatorHistory: PortfolioIndicators[];
  tradeHistory: PortfolioTrade[];
}

// Export Portfolio model
export const PortfolioModel = model<PortfolioModel>('Portfolio', portfolioSchema);
