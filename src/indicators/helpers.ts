// create a new object with every key prefixed by "$label-"
export function mergeLabel(object: any, label: string): any {
  return Object.keys(object).reduce((acc: any, currentKey: string) => {
    acc[`${label}-${currentKey}`] = object[currentKey];
    return acc;
  }, {});
}
