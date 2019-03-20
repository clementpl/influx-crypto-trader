import { writeFileSync, mkdirSync } from 'fs';
import { mean } from 'mathjs';
import PQueue from 'p-queue';

import { logger, TraderWorker, TraderConfig } from '../../../../src/exports';
import { deepFind } from '../../../_core/helpers';

interface GeneticOpts {
  threads: number;
  generation: number;
  popSize: number;
  elitism: number;
  mutationRate: number;
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
  return createTraderWorker(traderConfig, `${traderConfig.name}-gen${gen}-ind${ind}`, newOpts);
}

function getFitness(trader: TraderWorker): number {
  const currentProfit = deepFind(trader, 'trader.portfolio.indicators.currentProfit');
  return currentProfit === undefined ? -1 : currentProfit;
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
  return createTraderWorker(traderConfig, `${traderConfig.name}-gen${gen}-ind${ind}`, newOpts);
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
  return createTraderWorker(traderA.trader.config, name, newOpts);
}

function breedNewGeneration(
  traderConfig: TraderConfig,
  generation: TraderWorker[],
  opts: GeneticOpts,
  gen: number
): TraderWorker[] {
  const newGeneration: TraderWorker[] = [];
  // sort by fitness
  generation = generation.sort((a: any, b: any) => getFitness(b) - getFitness(a));
  // keep best indiv (unchanged)
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
        randomBetween(0, 1) < 0.5 ? mutate(traderConfig, bestIndiv, opts, gen, newGeneration.length) : bestIndiv;
      newGeneration.push(indiv);
    }
  }
  // Mutate or breed new indiv
  while (newGeneration.length < opts.popSize) {
    // crossover 75% chance
    if (randomBetween(0, 1) >= 0.25) {
      // Get parent1 and 2 randomly (Make sure parent1 and 2 are different)
      const t1 = generation[randomBetween(0, Math.floor(generation.length / 2), true)];
      let t2 =
        generation[randomBetween(0, Math.floor(gen >= 10 ? generation.length - 1 : generation.length / 2), true)];
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
        createTraderWorker(traderConfig, `${traderConfig.name}-gen${gen}-ind${ind}`, traderConfig.stratOpts)
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
                      await t.init();
                      await t.start();
                      await t.stop();
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
