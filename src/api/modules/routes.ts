import { routes as traderRoutes } from './Traders/routes';
import { routes as trainingRoutes } from './Training/routes';

export const routes = traderRoutes.concat(trainingRoutes);
