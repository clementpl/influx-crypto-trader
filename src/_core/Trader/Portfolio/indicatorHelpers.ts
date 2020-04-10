import { PortfolioTrade } from '@src/_core/exports';

export function standardDeviation(tradeHistory: PortfolioTrade[]) {
  const sumP = tradeHistory.reduce((sum, t) => (sum += t.orderProfit), 0);
  const meanP = sumP / tradeHistory.length;
  const squaredMeanDiff = tradeHistory.reduce((sum, t) => (sum += Math.pow(t.orderProfit - meanP, 2)), 0);

  // Profit standard deviation
  const stdDev = squaredMeanDiff === 0 ? 0 : Math.sqrt(squaredMeanDiff / tradeHistory.length);
  return stdDev;
}

// https://blog.quantinsti.com/sharpe-ratio-applications-algorithmic-trading/
export function calcSharpeRatio(tradeHistory: PortfolioTrade[]) {
  if (tradeHistory.length < 2) return -1;

  const sumP = tradeHistory.reduce((sum, t) => (sum += t.orderProfit), 0);
  // Profit average
  const meanP = sumP / tradeHistory.length;
  const squaredMeanDiff = tradeHistory.reduce((sum, t) => (sum += Math.pow(t.orderProfit - meanP, 2)), 0);

  // Profit standard deviation
  const stdDev = squaredMeanDiff === 0 ? 0.001 : Math.sqrt(squaredMeanDiff / tradeHistory.length);

  // SharpeRatio
  const sharpeRatio = Math.sqrt(tradeHistory.length) * (meanP / stdDev);
  return sharpeRatio;
}

// https://blog.quantinsti.com/sharpe-ratio-applications-algorithmic-trading/
export function calcSortinaRatio(tradeHistory: PortfolioTrade[]) {
  if (tradeHistory.length < 2) return -1;

  // Average profits
  const sumP = tradeHistory.reduce((sum, t) => (sum += t.orderProfit), 0);
  const meanP = sumP / tradeHistory.length;

  // Standard deviation of negative trades
  const tradeHistNeg = tradeHistory.filter(t => t.orderProfit < 0);
  const sumNegP = tradeHistNeg.length === 0 ? 0 : tradeHistNeg.reduce((sum, t) => (sum += t.orderProfit), 0);
  const meanNegP = tradeHistNeg.length === 0 ? 0 : sumNegP / tradeHistNeg.length;
  const squaredMeanDiff =
    tradeHistNeg.length === 0 ? 0 : tradeHistNeg.reduce((sum, t) => (sum += Math.pow(t.orderProfit - meanNegP, 2)), 0);
  const stdDev =
    squaredMeanDiff === 0 || tradeHistNeg.length === 0 ? 0.001 : Math.sqrt(squaredMeanDiff / tradeHistNeg.length);

  // Sortina ratio
  const sortinaRatio = Math.sqrt(tradeHistory.length) * (meanP / stdDev);
  return sortinaRatio;
}
