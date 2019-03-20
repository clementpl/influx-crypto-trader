export default {
  nbOrder: 0,
  beforeAll: () => {},
  before: () => {},
  run: () => {
    const rand = Math.floor(Math.random() * 100);
    // BUY
    if (rand === 1 && this.nbOrder === 0) {
      this.nbOrder++;
      return 'buy';
    }
    // SELL
    if (
      this.nbOrder === 1 &&
      rand === 2
      // currentTrade &&
      // (rand === 2 || currentTrade.orderProfit >= 0.05 || currentTrade.orderProfit < -0.03)
    ) {
      this.nbOrder--;
      return 'sell';
    }
    return '';
  },
  after: () => {},
  afterAll: () => {},
};
