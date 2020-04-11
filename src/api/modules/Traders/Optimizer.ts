import { writeFileSync, mkdirSync } from 'fs';
import { mean } from 'mathjs';
import PQueue from 'p-queue';

import { logger, TraderWorker as TraderWorkerBase, TraderConfig } from '../../../exports';
import { deepFind } from '../../../_core/helpers';
import { Status, PortfolioTrade } from '@src/_core/exports';
import { standardDevationObjects } from './fitnessHelper';

interface Fitness {
  currentProfit: number;
  percentTradeWin: number;
  sortinaRatio: number;
  [name: string]: number;
}

class TraderWorker extends TraderWorkerBase {
  // All fitnesses
  public fitnesses: Fitness[];
  public fitnessMean: Fitness;
  public fitnessStd: Fitness;
  public fitnessMeanRed: Fitness;
  // Only negative fitnesses
  public fitnessesNeg: Fitness[];
  public fitnessNegMean: Fitness;
  public fitnessNegStd: Fitness;
  public fitnessNegMeanRed: Fitness;
  // Others
  public hasRunned: boolean = false;
  public rank: number;
  [name: string]: any;
}

export enum FitnessType {
  FITNESS_MEAN = 'fitnessMean',
  FITNESS_MEAN_RED = 'fitnessMeanRed',
  FITNESS_NEG_MEAN_RED = 'fitnessNegMeanRed',
}

export interface GeneticOpts {
  silent: boolean;
  threads: number;
  fitnessType: FitnessType;
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
  list?: string[];
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
  traderConfig.env.aggTimes = [];
  traderConfig.env.candleSetPlugins = [];
  const trader = new TraderWorker(
    {
      ...traderConfig,
      stratOpts,
      name,
    },
    { silent }
  );
  trader.hasRunned = false;
  return trader;
}

function randomIndiv(traderConfig: TraderConfig, opts: GeneticOpts, gen: number, ind: number): TraderWorker {
  const newOpts = { ...traderConfig.stratOpts };
  opts.genes.forEach(g => {
    if (g.list) {
      newOpts[g.key] = g.list[randomBetween(0, g.list.length - 1, true)];
    } else {
      newOpts[g.key] = randomBetween(g.min, g.max, g.integer);
    }
  });
  return createTraderWorker(traderConfig, `${traderConfig.name}-gen${gen}-ind${ind}`, newOpts, opts.silent);
}

function calculateFitnessRank(generation: TraderWorker[], fitnessType: FitnessType) {
  // Compute fitness mean/std/meanReduce for each indiv
  generation.forEach(t => {
    // Calc mean + standardDeviation
    [t.fitnessMean, t.fitnessStd] = standardDevationObjects(t.fitnesses);
    // Calc mean reduite
    t.fitnessMeanRed = { currentProfit: 0, percentTradeWin: 0, sortinaRatio: 0 };
    Object.keys(t.fitnessMeanRed).forEach(k => (t.fitnessMeanRed[k] = t.fitnessMean[k] - t.fitnessStd[k]));

    /* Only with fitness negative (according to currentProfit) */
    t.fitnessesNeg = t.fitnesses.filter(f => f.currentProfit < 0);
    // Calc mean + standardDeviation
    [t.fitnessNegMean, t.fitnessNegStd] = standardDevationObjects(t.fitnessesNeg);
    // Calc mean reduite with standard deviation of negative returns (environment with return < 0)
    t.fitnessNegMeanRed = { currentProfit: 0, percentTradeWin: 0, sortinaRatio: 0 };
    Object.keys(t.fitnessNegMeanRed).forEach(k => (t.fitnessNegMeanRed[k] = t.fitnessMean[k] - t.fitnessNegStd[k]));
  });

  // Compute rank
  generation.forEach(t => {
    t.rank = 1;
    generation.forEach(t2 => {
      if (t.config.name !== t2.config.name) {
        let objectiveWins = 0;
        if (t[fitnessType].currentProfit > t2[fitnessType].currentProfit) objectiveWins++;
        if (t[fitnessType].percentTradeWin > t2[fitnessType].percentTradeWin) objectiveWins++;
        if (t[fitnessType].sortinaRatio > t2[fitnessType].sortinaRatio) objectiveWins++;
        if (objectiveWins < 2) t.rank++;
      }
    });
  });

  // Sort by rank
  generation = generation.sort((a, b) => a.rank - b.rank);
  // convert non suite rank [2,2,2,3,7,8,8,...] to correct rank suite [1,1,1,2,3,4,4,...]
  let lastRank: number;
  let newRankIdx = 1;
  generation.forEach((t, idx) => {
    if (idx === 0) {
      lastRank = t.rank;
    } else if (t.rank > lastRank) {
      lastRank = t.rank;
      newRankIdx++;
    }
    t.rank = newRankIdx;
  });
  console.log('CALCULATE FITNESS RANK FINISH');
  console.log(
    JSON.stringify(
      generation.map(t => ({
        name: t.config.name,
        rank: t.rank,
        fitnesses: t.fitnesses,
        fitnessMean: t.fitnessMean,
        fitnessStd: t.fitnessStd,
        fitnessMeanRed: t.fitnessMeanRed,
        fitnessesNeg: t.fitnessesNeg,
        fitnessNegMean: t.fitnessNegMean,
        fitnessNegStd: t.fitnessNegStd,
        fitnessNegMeanRed: t.fitnessNegMeanRed,
      }))
    )
  );
}

function sumFitness(fitness: Fitness) {
  return Object.values(fitness).reduce((acc, current) => (acc += current), 0);
}

function tournamentSelection(generation: TraderWorker[], participant: number = 4): TraderWorker[] {
  const checkSameFitness = (indivs: TraderWorker[], trader: TraderWorker) => {
    const fitnessTarget = sumFitness(trader.fitnessMean);
    for (const t of indivs) {
      if (sumFitness(t.fitnessMean) === fitnessTarget) return true;
    }
    return false;
  };
  const traders: TraderWorker[] = [];
  // Select X random participant
  for (let i = 0; i < participant; i++) {
    let trader = generation[randomBetween(0, generation.length - 1, true)];
    let j = 0;
    // Search for other trader different from first one
    while (j++ < generation.length && checkSameFitness(traders, trader)) {
      trader = generation[randomBetween(0, generation.length - 1, true)];
    }
    traders.push(trader);
  }
  // return 2 best traders from tournament
  const toRet = traders.sort((a: any, b: any) => a.rank - b.rank).slice(0, 2);
  return toRet;
}

function calcFitness(trader: TraderWorker): Fitness {
  // Current Profit
  let currentProfit = deepFind(trader, 'trader.portfolio.indicators.currentProfit');
  currentProfit = currentProfit === undefined || currentProfit === 0 ? -1 : currentProfit;
  // Percent Trade Win
  const tradeHistory: PortfolioTrade[] = deepFind(trader, 'trader.portfolio.tradeHistory') || [];
  const percentTradeWin =
    tradeHistory.length > 0 ? tradeHistory.filter(trade => trade.orderProfit > 0).length / tradeHistory.length : 0;
  // Sharpe/Sortina ratio
  // const sharpeRatio = deepFind(trader, 'trader.portfolio.backtestIndicators.sharpeRatio');
  const sortinaRatio = deepFind(trader, 'trader.portfolio.backtestIndicators.sortinaRatio');

  return {
    currentProfit,
    percentTradeWin,
    sortinaRatio,
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
    // If gene should mutate
    if (randomBetween(0, 1) <= opts.mutationRate) {
      // Mutate value from list
      if (g.list) {
        newOpts[g.key] = g.list[randomBetween(0, g.list.length - 1, true)];
      }
      // Mutate numeric value
      // Mutation move value between 0.5% to 50%
      else {
        const direction = randomBetween(0, 1, true) === 0 ? -1 : 1;
        const range = g.max - g.min;
        const diff = range * randomBetween(0.005, 0.5) * direction;
        let newVal = oldOpts[g.key] + diff;
        newVal = newVal < g.min ? g.min : newVal > g.max ? g.max : newVal;
        newOpts[g.key] = g.integer ? Math.floor(newVal) : newVal;
      }
    }
  });
  return createTraderWorker(traderConfig, `${traderConfig.name}-gen${gen}-ind${ind}`, newOpts, opts.silent);
}

function crossover(name: string, traderA: TraderWorker, traderB: TraderWorker, opts: GeneticOpts): TraderWorker {
  // Set gene as traderB
  const newOpts = { ...traderB.config.stratOpts };
  // Take some gene of traderA if mutation prob OK
  opts.genes.forEach(g => {
    if (randomBetween(0, 1) < 0.5) {
      if (g.list) newOpts[g.key] = g.list[randomBetween(0, g.list.length - 1, true)];
      else newOpts[g.key] = traderA.config.stratOpts[g.key];
    }
  });
  // mutate new indiv (25% chance)
  if (randomBetween(0, 1) < 0.25) {
    opts.genes.forEach(g => {
      if (randomBetween(0, 1) <= opts.mutationRate) {
        if (g.list) newOpts[g.key] = g.list[randomBetween(0, g.list.length - 1, true)];
        else newOpts[g.key] = randomBetween(g.min, g.max, g.integer);
      }
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
  // sort by fitness (but keep only different fitness at the top => try to avoid same indiv convergence)
  generation = generation.sort((a: any, b: any) => a.rank - b.rank);
  const generationResort: TraderWorker[] = [];
  let currentIdx = 1;
  // Sort indiv by fitness (take care of keeping only one version of each individu)
  generation.forEach((indiv, idx) => {
    // keep best indiv (first one)
    if (idx === 0) generationResort.push(indiv);
    else {
      // If same fitness push back
      if (sumFitness(indiv.fitnessMean) - sumFitness(generation[idx - 1].fitnessMean) === 0) {
        generationResort.push(indiv);
      }
      // Else push front
      else generationResort.splice(currentIdx++, 0, indiv);
    }
  });
  generation = generationResort;

  /* CREATE NEW GENERATION */
  const newGeneration: TraderWorker[] = [];
  // keep best indiv
  const bestIndivs = generation.slice(0, opts.elitism);
  newGeneration.push(...bestIndivs);

  // New random indiv (mini 1 new random indiv to max 20%)
  const newRandIndiv = randomBetween(1, Math.floor(newGeneration.length / 5), true);
  let i = 0;
  while (newGeneration.length < opts.popSize && i++ < newRandIndiv) {
    newGeneration.push(randomIndiv(traderConfig, opts, gen, newGeneration.length));
  }

  // Mutate or crossover new indiv
  while (newGeneration.length < opts.popSize) {
    const rand = randomBetween(0, 1);
    // Breed indiv using crossover (60%)
    if (rand < 0.6) {
      // Get parent1 and 2 randomly (Make sure parent1 and 2 are different)
      const [t1, t2] = tournamentSelection(generation, 4);
      // create children
      newGeneration.push(crossover(`${traderConfig.name}-gen${gen}-ind${newGeneration.length}`, t1, t2, opts));
    }
    // Breed indiv using mutation (40%)
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

/* tslint:disable */
export class Optimizer {
  public static generation: TraderWorker[] = [];
  public static pqueue: PQueue;

  public static getQueue(concurrency: number): PQueue {
    if (Optimizer.pqueue) Optimizer.pqueue.clear();
    Optimizer.pqueue = new PQueue({ concurrency, autoStart: true });
    return Optimizer.pqueue;
  }

  public static stop() {
    if (Optimizer.pqueue) Optimizer.pqueue.clear();
    if (Optimizer.generation.length > 0) {
      Optimizer.generation.forEach(t => t.stop());
    }
  }

  public static async genetic(trader: TraderConfig, opts: GeneticOpts) {
    let gen = 0;
    const traderConfig = { ...trader };
    let generation: TraderWorker[] = [];

    while (gen < opts.generation) {
      try {
        generation =
          generation.length === 0
            ? makeGeneration(traderConfig, opts, gen)
            : breedNewGeneration(traderConfig, generation, opts, gen);

        // Bind generation to optimizer (enable ctrl+c exit)
        Optimizer.generation = generation;
        // Clear promise queue
        const pqueue = Optimizer.getQueue(opts.threads);
        pqueue.clear();
        // Add promise to execute inside queue (start executing it)
        generation.forEach(t => {
          pqueue
            .add(
              // Exec trader task
              () =>
                new Promise(async (resolve, reject) => {
                  try {
                    // avoid resimulating elite individual
                    if (t.hasRunned !== true) {
                      for (let i = 0; i < opts.envs.length; i++) {
                        t.config.env.backtest = opts.envs[i];
                        t.config.flush = i === 0 ? true : false;
                        await t.init(); // flush only first envs
                        await t.start();
                        await t.stop();
                        if (!t.fitnesses) t.fitnesses = [];
                        t.fitnesses.push(calcFitness(t));
                      }
                    }
                    t.hasRunned = true;
                    resolve();
                  } catch (error) {
                    // set fitness to -1 on error
                    if (!t.fitnesses) t.fitnesses = [];
                    t.fitnesses.push({
                      currentProfit: -1,
                      percentTradeWin: -1,
                      sortinaRatio: -1,
                    });
                    if (t.trader.status !== Status.STOP) await t.stop().catch(error => logger.error(error));
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

        // Calculate rank (multi objective) and sort it (by rank)
        calculateFitnessRank(generation, opts.fitnessType);

        // LOGGING
        // Traders already sort by fitness
        const g = generation;
        logger.info('RESULT GEN ' + gen);
        const fitnessesSummed = g.map(t => sumFitness(t[opts.fitnessType]));
        const fitnessesCurrentProfit = g.map(t => t[opts.fitnessType].currentProfit);
        const fitnessesPercentTradeWin = g.map(t => t[opts.fitnessType].percentTradeWin);
        const fitnessesSortinaRatio = g.map(t => t[opts.fitnessType].sortinaRatio);
        logger.info(
          g
            .map(t => {
              return `[${t.config.name}] rank: ${t.rank}, currentProfit: ${
                t[opts.fitnessType].currentProfit
              }, percentTradeWin: ${t[opts.fitnessType].percentTradeWin}, sortinaRatio: ${
                t[opts.fitnessType].sortinaRatio
              }`;
            })
            .join('\n')
        );
        logger.info(
          `[fitnessesSummed] mean: ${mean(...fitnessesSummed)} min: ${Math.min(...fitnessesSummed)} max: ${Math.max(
            ...fitnessesSummed
          )}\n` +
            `[fitnessesCurrentProfit] mean: ${mean(...fitnessesCurrentProfit)} min: ${Math.min(
              ...fitnessesCurrentProfit
            )} max: ${Math.max(...fitnessesCurrentProfit)}\n` +
            `[fitnessesPercentTradeWin] mean: ${mean(...fitnessesPercentTradeWin)} min: ${Math.min(
              ...fitnessesPercentTradeWin
            )} max: ${Math.max(...fitnessesPercentTradeWin)}\n` +
            `[fitnessesSortinaRatio] mean: ${mean(...fitnessesSortinaRatio)} min: ${Math.min(
              ...fitnessesSortinaRatio
            )} max: ${Math.max(...fitnessesSortinaRatio)}\n`
        );
        // Flush config of the generation
        mkdirSync(`optimizer/genetic/${traderConfig.name}`, { recursive: true });
        writeFileSync(
          `optimizer/genetic/${traderConfig.name}/gen${gen}.json`,
          `${JSON.stringify(
            {
              result: {
                mean: mean(...fitnessesSummed),
                min: Math.min(...fitnessesSummed),
                max: Math.max(...fitnessesSummed),
                meanProfit: mean(...fitnessesCurrentProfit),
                minProfit: Math.min(...fitnessesCurrentProfit),
                maxProfit: Math.max(...fitnessesCurrentProfit),
                meanTradeWin: mean(...fitnessesPercentTradeWin),
                minTradeWin: Math.min(...fitnessesPercentTradeWin),
                maxTradeWin: Math.max(...fitnessesPercentTradeWin),
                meanSortinaRatio: mean(...fitnessesSortinaRatio),
                minSortinaRatio: Math.min(...fitnessesSortinaRatio),
                maxSortinaRatio: Math.max(...fitnessesSortinaRatio),
              },
              gen: g.map(t => ({
                name: t.config.name,
                fitnessMean: t.fitnessMean,
                fitnessStd: t.fitnessStd,
                fitnessMeanRed: t.fitnessMeanRed,
                fitness: t.fitnesses,
                config: t.config.stratOpts,
              })),
            },
            null,
            2
          )}`
        );
        gen++;
      } catch (error) {
        if (generation) generation.forEach(t => t.stop().catch((error: any) => logger.error(error)));
        logger.error(error);
        throw Error('Problem during genetic optimization');
      }
    }
  }
}
