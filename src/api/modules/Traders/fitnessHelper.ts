function getNewObjectInit(data: { [name: string]: number }, initVal: number = 0) {
  const accInit: { [name: string]: number } = {};
  Object.keys(data).forEach(k => (accInit[k] = initVal));
  return accInit;
}

/**
 * Compute standard deviation for each property of an object
 * return an array with the mean of each property in the first index
 * and the standard deviation of each property in the second index
 *
 * @export
 * @param {Array<{ [name: string]: number }>} data
 * @returns {[any, any]}
 */
export function standardDevationObjects(data: Array<{ [name: string]: number }>): [any, any] {
  const dataMean = data.reduce((acc, current) => {
    Object.keys(acc).forEach(k => (acc[k] += current[k]));
    return acc;
  }, getNewObjectInit(data[0]));
  // Calc mean
  if (data.length > 0) {
    Object.keys(dataMean).forEach(k => (dataMean[k] /= data.length));
  }

  // Calc (val - mean) pow2 (sum distance)
  const dataStd = data.reduce((acc, current) => {
    Object.keys(acc).forEach(k => {
      acc[k] += Math.pow(current[k] - dataMean[k], 2);
    });
    return acc;
  }, getNewObjectInit(data[0]));
  // Calc standard deviation (=sqrt(variance))
  Object.keys(dataStd).forEach(k => (dataStd[k] = Math.sqrt(dataStd[k] / data.length)));

  return [dataMean, dataStd];
}
