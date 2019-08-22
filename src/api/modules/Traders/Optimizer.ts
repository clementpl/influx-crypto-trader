import { writeFileSync, mkdirSync } from 'fs';
import { mean } from 'mathjs';
import PQueue from 'p-queue';

import { logger } from '../../../../src/exports';
import { Status, Env, EnvConfig, Trader as TraderBase, TraderConfig, CandleSet } from '@src/_core/exports';

class Trader extends TraderBase {
  public fitnesses: Array<{
    currentProfit: number;
    percentTradeWin: number;
    tradeFreqency: number;
    total: number;
    [name: string]: number;
  }>;
  public hasRunned: boolean = false;
  public hasStopped: boolean = false;
}

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
  list?: string[];
}

function randomBetween(min: number, max: number, integer?: boolean): number {
  if (integer === true) return Math.floor(Math.random() * (max - min + 1) + min);
  return Math.random() * (max - min) + min;
}

function createTrader(
  traderConfig: TraderConfig,
  name: string,
  stratOpts: TraderConfig['stratOpts'],
  silent: boolean = true
) {
  return new Trader(
    JSON.parse(
      JSON.stringify({
        ...traderConfig,
        stratOpts,
        name,
        silent,
        persist: false,
        saveInputs: false,
      })
    )
  );
}

function randomIndiv(traderConfig: TraderConfig, opts: GeneticOpts, gen: number, ind: number): Trader {
  const newOpts = { ...traderConfig.stratOpts };
  opts.genes.forEach(g => {
    if (g.list) {
      newOpts[g.key] = g.list[randomBetween(0, g.list.length - 1, true)];
    } else {
      newOpts[g.key] = randomBetween(g.min, g.max, g.integer);
    }
  });
  return createTrader(traderConfig, `${traderConfig.name}-gen${gen}-ind${ind}`, newOpts, opts.silent);
}

function tournamentSelection(generation: Trader[], participant: number = 4): Trader[] {
  const checkSameFitness = (indivs: Trader[], fitness: number) => {
    for (const trader of indivs) {
      if (getFitness(trader) === fitness) return true;
    }
    return false;
  };
  const traders: Trader[] = [];
  // Select X random participant
  for (let i = 0; i < participant; i++) {
    let trader = generation[randomBetween(0, generation.length - 1, true)];
    let j = 0;
    while (j++ < generation.length && checkSameFitness(traders, getFitness(trader))) {
      trader = generation[randomBetween(0, generation.length - 1, true)];
    }
    traders.push(trader);
  }
  // return 2 best traders from tournament
  return traders.sort((a: any, b: any) => getFitness(b) - getFitness(a)).slice(0, 2);
}

function getFitness(trader: Trader, key: string = 'total'): number {
  let sum = 0;
  for (const fitness of trader.fitnesses) {
    sum += fitness[key];
  }
  const score = sum / trader.fitnesses.length;
  // Add 0.5 bonus points to total
  let bonus = 0;
  if (key === 'total') {
    if (trader.fitnesses.filter(f => f.currentProfit > 0.05).length === trader.fitnesses.length) bonus += 0.25;
    if (trader.fitnesses.filter(f => f.percentTradeWin > 0.6).length === trader.fitnesses.length) bonus += 0.25;
  }
  return score + bonus;
}

function calcFitness(
  trader: Trader
): { currentProfit: number; percentTradeWin: number; tradeFreqency: number; total: number } {
  let currentProfit = trader.portfolio.indicators.currentProfit;
  currentProfit = currentProfit === undefined || currentProfit === 0 ? -1 : currentProfit;
  const tradeHistory = trader.portfolio.tradeHistory || [];
  const percentTradeWin =
    tradeHistory.length === 0
      ? 0
      : tradeHistory.filter((trade: any) => trade.orderProfit > 0.001).length / tradeHistory.length;
  const { start, stop } = trader.config.env.backtest!;
  const limit = Math.floor(daysBetween(new Date(start), new Date(stop)) / 3);
  let tradeFreqency = tradeHistory.length / limit === 0 ? 1 : limit;
  tradeFreqency = tradeFreqency > 1 ? 1 : tradeFreqency;
  return {
    currentProfit,
    percentTradeWin,
    tradeFreqency,
    total: currentProfit + percentTradeWin /* + tradeFreqency*/,
  };
}

function mutate(traderConfig: TraderConfig, trader: Trader, opts: GeneticOpts, gen: number, ind: number): Trader {
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
  return createTrader(traderConfig, `${traderConfig.name}-gen${gen}-ind${ind}`, newOpts, opts.silent);
}

function crossover(name: string, traderA: Trader, traderB: Trader, opts: GeneticOpts): Trader {
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
  return createTrader(traderA.config, name, newOpts, opts.silent);
}

function breedNewGeneration(
  traderConfig: TraderConfig,
  generation: Trader[],
  opts: GeneticOpts,
  gen: number
): Trader[] {
  // sort by fitness (but keep only different fitness at the top => try to avoid same indiv convergence)
  generation = generation.sort((a: any, b: any) => getFitness(b) - getFitness(a));
  const generationResort: Trader[] = [];
  let currentIdx = 1;
  // Sort indiv by fitness (take care of keeping only one version of each individu)
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

  /* CREATE NEW GENERATION */
  const newGeneration: Trader[] = [];
  // keep best indiv
  const bestIndivs = generation.slice(0, opts.elitism);
  newGeneration.push(...bestIndivs);

  // Mutate or breed new indiv
  while (newGeneration.length < opts.popSize) {
    // Breed indiv using crossover (66%)
    if (randomBetween(0, 1) > 0.33) {
      // Get parent1 and 2 randomly (Make sure parent1 and 2 are different)
      const [t1, t2] = tournamentSelection(generation, 4);
      // create children
      newGeneration.push(crossover(`${traderConfig.name}-gen${gen}-ind${newGeneration.length}`, t1, t2, opts));
    }
    // Breed indiv using mutation (33%)
    else {
      const t = generation[randomBetween(0, generation.length - 1, true)];
      newGeneration.push(mutate(traderConfig, t, opts, gen, newGeneration.length));
    }
  }
  return newGeneration;
}

function makeGeneration(traderConfig: TraderConfig, opts: GeneticOpts, gen: number): Trader[] {
  let ind = 0;
  const generation = [];
  while (ind < opts.popSize) {
    // Add best indiv (no mutation copy of config)
    if (ind === 0) {
      generation.push(
        createTrader(traderConfig, `${traderConfig.name}-gen${gen}-ind${ind}`, traderConfig.stratOpts, opts.silent)
      );
    } else {
      generation.push(randomIndiv(traderConfig, opts, gen, ind));
    }
    ind++;
  }
  return generation;
}

function getEnvConf(generation: Trader[]): EnvConfig {
  const plugins: EnvConfig['candleSetPlugins'] = [];
  const envConf: EnvConfig = generation[0].config.env;
  generation.forEach(t => {
    const conf = t.config.env;
    if (conf.candleSetPlugins) {
      // const pluginsDict = new Map<string, PluginConfig>();
      conf.candleSetPlugins.forEach(p => {
        // const integrity = sha256(JSON.stringify(p));
        // if (!pluginsDict.has(integrity)) pluginsDict.set(integrity, p);
        plugins.push(p);
      });
    }
  });
  envConf.candleSetPlugins = plugins;
  return envConf;
}

/* tslint:disable */
export class Optimizer {
  // public static runningTraders: Trader[] = [];
  /*public static pqueue: PQueue;
  public static getQueue(concurrency: number): PQueue {
    if (Optimizer.pqueue) Optimizer.pqueue.clear();
    Optimizer.pqueue = new PQueue({ concurrency, autoStart: true });
    return Optimizer.pqueue;
  }*/

  public static async genetic(trader: TraderConfig, opts: GeneticOpts) {
    let gen = 0;
    const traderConfig = { ...trader };
    let generation: Trader[] | undefined;
    while (gen < opts.generation) {
      try {
        generation = !generation
          ? makeGeneration(traderConfig, opts, gen)
          : breedNewGeneration(traderConfig, generation, opts, gen);

        logger.silent = true;
        // Init traders and merge env plugins
        const envConf = JSON.parse(JSON.stringify(trader.env));
        envConf.aggTimes = [];
        envConf.candleSetPlugins = [];
        for (const t of generation) {
          t.hasStopped = false;
          t.config.persist = false;
          t.config.saveInputs = false;
          await t.init();
          envConf.aggTimes.push(...t.env.conf.aggTimes);
          if (t.env.conf.candleSetPlugins) envConf.candleSetPlugins.push(...t.env.conf.candleSetPlugins);
          // t.env = undefined as any;
        }
        // Merge several envConfig into one unique
        // merge aggTimes (uniq)
        envConf.aggTimes = envConf.aggTimes.filter((elem: string, pos: number, arr: string[]) => {
          return arr.indexOf(elem) == pos;
        });
        // merge plugins (uniq) label need to bee the hash of opts => p.label = sha256(JSON.stringify(p.opts))
        const labels = envConf.candleSetPlugins.map((p: any) => p.label);
        envConf.candleSetPlugins = envConf.candleSetPlugins.filter((elem: any, pos: number) => {
          return labels.indexOf(elem.label) == pos;
        });

        // Init env
        const env = new Env(envConf); //getEnvConf(generation));
        await env.init();
        // console.log(env);

        // Run the environment
        const fetcher = env.getGenerator();
        let data: { done: boolean; value: CandleSet | undefined } = await fetcher.next();
        let candleSet: CandleSet;

        let lll = 0;
        while (!data.done) {
          if (lll++ % 10000 === 0) {
            const mem = process.memoryUsage();
            // if (mem.heapUsed / mem.heapTotal > 0.95) {
            console.log(mem);
            lll = 1
            //}
          }
          candleSet = data.value as CandleSet;
          // Step each indiv
          for (const t of generation) {
            if (!t.hasStopped && !t.hasRunned) {
              try {
                await t.step(candleSet);
              } catch (e) {
                logger.silent = false;
                logger.error(e);
                // set fitness to -1 on error
                t.hasStopped = true;
                if (!t.fitnesses) t.fitnesses = [];
                t.fitnesses.push({ currentProfit: -1, percentTradeWin: -1, tradeFreqency: -1, total: -1 });
                if (t.status !== Status.STOP) await t.stop().catch(error => logger.error(error));
                logger.silent = true;
              }
            }
          }
          // Fetch next step
          data = await fetcher.next();
        }

        // Stop and Calc fitnesses
        for (const t of generation) {
          t.hasRunned = true;
          if (t.status !== Status.STOP) await t.stop().catch(error => logger.error(error));
          if (!t.fitnesses) t.fitnesses = [];
          t.fitnesses.push(calcFitness(t));
        }

        // LOGGING
        logger.silent = false;
        // sort by fitness
        const g = generation.sort((a: any, b: any) => getFitness(b) - getFitness(a));
        logger.info('RESULT GEN ' + gen);
        const fitnesses = g.map((t: any) => getFitness(t));
        logger.info(
          g
            .map((t: Trader) => {
              const total = getFitness(t);
              const currentProfit = getFitness(t, 'currentProfit');
              const percentTradeWin = getFitness(t, 'percentTradeWin');
              const tradeFreqency = getFitness(t, 'tradeFreqency');
              return `[${
                t.config.name
              }] total: ${total}, currentProfit: ${currentProfit}, percentTradeWin: ${percentTradeWin}, tradeFreqency: ${tradeFreqency} `;
            })
            .join('\n')
        );
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
            gen: g.map(t => ({ name: t.config.name, fitness: t.fitnesses, config: t.config.stratOpts })),
          })}`
        );
        gen++;
      } catch (error) {
        logger.silent = false;
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
