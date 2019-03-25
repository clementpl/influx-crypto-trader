import { writeFileSync, mkdirSync } from 'fs';
import { mean } from 'mathjs';
import PQueue from 'p-queue';

import { logger, TraderWorker, TraderConfig } from '../../../../src/exports';
import { deepFind } from '../../../_core/helpers';

interface GeneticOpts {
  silent: boolean;
  threads: number;
  generation: number;
  popSize: number;
  elitism: number;
  mutationRate: number;
  envs: Array<{ start: string; stop: string }>;
  genes: Gene[];
}

interface Gene {
  key: string;
  min: number;
  max: number;
  integer?: boolean;
}

function randomBetween(min: number, max: number, integer?: boolean): number {
  if (integer === true) return Math.floor(Math.random() * (max - min + 1) + min);
  return Math.random() * (max - min) + min;
}

function createTraderWorker(
  traderConfig: TraderConfig,
  name: string,
  stratOpts: TraderConfig['stratOpts'],
  silent: boolean = true
) {
  return new TraderWorker(
    {
      ...traderConfig,
      stratOpts,
      name,
    },
    { silent }
  );
}

function randomIndiv(traderConfig: TraderConfig, opts: GeneticOpts, gen: number, ind: number): TraderWorker {
  const newOpts = { ...traderConfig.stratOpts };
  opts.genes.forEach(g => {
    newOpts[g.key] = randomBetween(g.min, g.max, g.integer);
  });
  return createTraderWorker(traderConfig, `${traderConfig.name}-gen${gen}-ind${ind}`, newOpts, opts.silent);
}

function getFitness(trader: TraderWorker): number {
  // const currentProfit = deepFind(trader, 'trader.portfolio.indicators.currentProfit');
  // return currentProfit === undefined ? -1 : currentProfit;
  let sum = 0;
  // for (let i = 0; i < (<any>trader).fitnesses.length; i++) {
  // console.log((<any>trader).fitnesses);
  for (const fitness of (<any>trader).fitnesses) {
    sum += fitness.total;
  }
  return sum / (<any>trader).fitnesses.length;
}

function calcFitness(
  trader: TraderWorker
): { currentProfit: number; percentTradeWin: number; tradeFreqency: number; total: number } {
  let currentProfit = deepFind(trader, 'trader.portfolio.indicators.currentProfit');
  currentProfit = currentProfit === undefined || currentProfit === 0 ? -1 : currentProfit;
  const tradeHistory = deepFind(trader, 'trader.portfolio.tradeHistory') || [];
  const percentTradeWin =
    tradeHistory.length === 0
      ? 0
      : tradeHistory.filter((trade: any) => trade.orderProfit > 0).length / tradeHistory.length;
  const { start, stop } = trader.config.env.backtest!;
  const limit = Math.floor(daysBetween(new Date(start), new Date(stop)) / 3);
  let tradeFreqency = tradeHistory.length / limit === 0 ? 1 : limit;
  tradeFreqency = tradeFreqency > 1 ? 1 : tradeFreqency;
  return {
    currentProfit,
    percentTradeWin,
    tradeFreqency,
    total: currentProfit + percentTradeWin + tradeFreqency,
  };
}

function mutate(
  traderConfig: TraderConfig,
  trader: TraderWorker,
  opts: GeneticOpts,
  gen: number,
  ind: number
): TraderWorker {
  const oldOpts = trader.config.stratOpts;
  const newOpts = { ...oldOpts };
  opts.genes.forEach(g => {
    // if (randomBetween(0, 1) <= opts.mutationRate) newOpts[g.key] = randomBetween(g.min, g.max, g.integer);
    // Mutation move value between 0.5% to 20%
    const direction = randomBetween(0, 1, true) === 0 ? -1 : 1;
    const range = g.max - g.min;
    const diff = range * randomBetween(0.005, 0.2) * direction;
    const newVal = oldOpts[g.key] + diff;
    if (randomBetween(0, 1) <= opts.mutationRate) newOpts[g.key] = g.integer ? Math.floor(newVal) : newVal;
  });
  return createTraderWorker(traderConfig, `${traderConfig.name}-gen${gen}-ind${ind}`, newOpts, opts.silent);
}

function crossover(name: string, traderA: TraderWorker, traderB: TraderWorker, opts: GeneticOpts): TraderWorker {
  // Set gene as traderB
  const newOpts = { ...traderB.config.stratOpts };
  // Take some gene of traderA if mutation prob OK
  opts.genes.forEach(g => {
    if (randomBetween(0, 1) < 0.5) newOpts[g.key] = traderA.config.stratOpts[g.key];
  });
  // mutate new indiv (25% chance)
  if (randomBetween(0, 1) < 0.25) {
    opts.genes.forEach(g => {
      if (randomBetween(0, 1) <= opts.mutationRate) newOpts[g.key] = randomBetween(g.min, g.max, g.integer);
    });
  }
  return createTraderWorker(traderA.trader.config, name, newOpts, opts.silent);
}

function breedNewGeneration(
  traderConfig: TraderConfig,
  generation: TraderWorker[],
  opts: GeneticOpts,
  gen: number
): TraderWorker[] {
  const newGeneration: TraderWorker[] = [];
  // sort by fitness (but keep only different fitness at the top => try to avoid same indiv convergence)
  generation = generation.sort((a: any, b: any) => getFitness(b) - getFitness(a));
  const generationResort: TraderWorker[] = [];
  let currentIdx = 1;
  generation.forEach((indiv, idx) => {
    // keep best indiv (first one)
    if (idx === 0) generationResort.push(indiv);
    else {
      // If same fitness push back
      if (getFitness(indiv) - getFitness(generation[idx - 1]) === 0) generationResort.push(indiv);
      // Else push front
      else generationResort.splice(currentIdx++, 0, indiv);
    }
  });
  generation = generationResort;
  // keep best indiv
  const bestIndivs = generation.slice(0, opts.elitism);
  for (const bestIndiv of bestIndivs) {
    // just rename best indiv with new name (will not rerun)
    bestIndiv.config.name = `${traderConfig.name}-gen${gen}-ind${newGeneration.length}`;
    // keep best unchanged
    if (newGeneration.length < 1) {
      newGeneration.push(bestIndiv);
    } else {
      // Mutate indiv or keep it unmutate
      const indiv =
        randomBetween(0, 1) < 0.33 ? mutate(traderConfig, bestIndiv, opts, gen, newGeneration.length) : bestIndiv;
      newGeneration.push(indiv);
    }
  }
  // Mutate or breed new indiv
  while (newGeneration.length < opts.popSize) {
    // crossover 75% chance
    if (randomBetween(0, 1) >= 0.25) {
      // Get parent1 and 2 randomly (Make sure parent1 and 2 are different)
      /*const t1 = generation[randomBetween(0, Math.floor(generation.length / 2), true)];
      let t2 =
        generation[randomBetween(0, Math.floor(gen >= 10 ? generation.length - 1 : generation.length / 2), true)];*/
      const t1 = generation[randomBetween(0, generation.length - 1, true)];
      let t2 = generation[randomBetween(0, generation.length - 1, true)];
      while (getFitness(t2) === getFitness(t1)) t2 = generation[randomBetween(0, generation.length - 1, true)];
      // create children
      newGeneration.push(crossover(`${traderConfig.name}-gen${gen}-ind${newGeneration.length}`, t1, t2, opts));
    }
    // mutation
    else {
      const t = generation[randomBetween(0, generation.length - 1, true)];
      newGeneration.push(mutate(traderConfig, t, opts, gen, newGeneration.length));
    }
  }
  return newGeneration;
}

function makeGeneration(traderConfig: TraderConfig, opts: GeneticOpts, gen: number): TraderWorker[] {
  let ind = 0;
  const generation = [];
  while (ind < opts.popSize) {
    // Add best indiv (no mutation copy of config)
    if (ind === 0) {
      generation.push(
        createTraderWorker(
          traderConfig,
          `${traderConfig.name}-gen${gen}-ind${ind}`,
          traderConfig.stratOpts,
          opts.silent
        )
      );
    } else {
      generation.push(randomIndiv(traderConfig, opts, gen, ind));
    }
    ind++;
  }
  return generation;
}

export class Optimizer {
  public static runningTraders: TraderWorker[] = [];
  public static pqueue: PQueue;
  public static getQueue(concurrency: number): PQueue {
    if (Optimizer.pqueue) Optimizer.pqueue.clear();
    Optimizer.pqueue = new PQueue({ concurrency, autoStart: true });
    return Optimizer.pqueue;
  }

  public static async genetic(trader: TraderConfig, opts: GeneticOpts) {
    let gen = 0;
    const traderConfig = { ...trader };
    let generation;
    while (gen < opts.generation) {
      try {
        generation = !generation
          ? makeGeneration(traderConfig, opts, gen)
          : breedNewGeneration(traderConfig, generation, opts, gen);
        // Clear promise queue
        const pqueue = Optimizer.getQueue(opts.threads);
        pqueue.clear();
        // Add promise to execute inside queue (start executing it)
        generation.forEach((t: TraderWorker) => {
          pqueue
            .add(
              // Exec trader task
              () =>
                new Promise(async (resolve, reject) => {
                  try {
                    // avoid resimulating elite individual
                    if ((<any>t).hasRunned !== true) {
                      for (let i = 0; i < opts.envs.length; i++) {
                        t.config.env.backtest = opts.envs[i];
                        t.config.flush = i === 0 ? true : false;
                        await t.init(); // flush only first envs
                        await t.start();
                        await t.stop();
                        if (!(<any>t).fitnesses) (<any>t).fitnesses = [];
                        (<any>t).fitnesses.push(calcFitness(t));
                      }
                    }
                    (<any>t).hasRunned = true;
                    resolve();
                  } catch (error) {
                    await t.stop().catch(error => logger.error(error));
                    reject(error);
                  }
                })
            )
            .catch(error => {
              logger.error(error);
              // logger.error(new Error(`Problem while running ${t.config.name}`));
            });
        });
        // Execute traders with batchSize = Optimize.threadsSize
        // Wait end of runnings trader
        await pqueue.onIdle();

        // LOGGING
        // sort by fitness
        const g = generation.sort((a: any, b: any) => getFitness(b) - getFitness(a));
        logger.info('RESULT GEN ' + gen);
        const fitnesses = g.map((t: any) => getFitness(t));
        logger.info(g.map((t: any) => `${t.config.name}: ${getFitness(t)}`).join('\n'));
        logger.info(
          'mean: ' + mean(...fitnesses) + ' min: ' + Math.min(...fitnesses) + ' max: ' + Math.max(...fitnesses)
        );
        // Flush config of the generation
        mkdirSync(`optimizer/genetic/${traderConfig.name}`, { recursive: true });
        writeFileSync(
          `optimizer/genetic/${traderConfig.name}/gen${gen}`,
          `${JSON.stringify({
            result: {
              mean: mean(...fitnesses),
              min: Math.min(...fitnesses),
              max: Math.max(...fitnesses),
            },
            gen: g.map(t => ({ fitness: getFitness(t), config: t.config.stratOpts })),
          })}`
        );
        gen++;
      } catch (error) {
        if (generation) generation.forEach(t => t.stop().catch(error => logger.error(error)));
        logger.error(error);
        throw Error('Problem during genetic optimization');
      }
    }
  }
}

// helper
function daysBetween(date1: Date, date2: Date) {
  // Get 1 day in milliseconds
  const oneDay = 1000 * 60 * 60 * 24;
  // Calculate the difference in milliseconds
  const diffms = date2.getTime() - date1.getTime();
  // Convert back to days and return
  return Math.round(diffms / oneDay);
}
