export function requireUncached(module: string) {
  delete require.cache[require.resolve(module)];
  return require(module);
}

export function sleep(ms: number): Promise<{}> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Flatten a deep object into a one level object with it’s path as key
 *
 * @param  {object} object - The object to be flattened
 * @return {object}        - The resulting flat object
 */
export function flatten(object: any) {
  return Object.assign(
    {},
    ...(function _flatten(objectBit, path = ''): any {
      // spread the result into our return object
      return [].concat(
        // concat everything into one level
        ...Object.keys(objectBit).map(
          // iterate over object
          key =>
            typeof objectBit[key] === 'object' // check if there is a nested object
              ? _flatten(objectBit[key], `${path}${key}`) // call itself if there is
              : { [`${path}${path ? '-' : ''}${key}`]: objectBit[key] } // append object with it’s path as key
        )
      );
    })(object)
  );
}
