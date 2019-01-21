import * as moment from 'moment';
// Loop over keys
// example symbol
/**
 * Loop over tags and return string usable for query
 * example for tags = {symbol:'BTC/USDT', lala:'lolo'}
 *        RETURN 'symbol=BTC/USDT AND lala=lolo'
 * @export
 * @param {{ [name: string]: string }} tags
 */
export function tagsToString(tags: { [name: string]: string }) {
  let str = '';
  const keys = Object.keys(tags);
  keys.forEach((key, idx) => (str += `"${key}"='${tags[key]}'${idx === keys.length - 1 ? '' : ' AND '}`));
  return str;
}
export function tagsToRegexp(tags: { [name: string]: string }) {
  let str = '';
  const keys = Object.keys(tags);
  keys.forEach((key, idx) => (str += `"${key}" =~ ${tags[key]}${idx === keys.length - 1 ? '' : ' AND '}`));
  return str;
}

export function getSinceFromNow(aggregatedTime: string, limit: number): string {
  const unit: string = aggregatedTime[aggregatedTime.length - 1];
  const amount: number = +aggregatedTime.slice(0, aggregatedTime.length - 1);
  return moment()
    .subtract(unit, (limit * amount) as any)
    .utc()
    .format();
}

export function getStop(since: string, limit: number) {
  return moment(since)
    .add(limit + 1, 'm')
    .utc()
    .format();
}

export function filterNaN(obj: any): any {
  const ret: any = {};
  for (const key of Object.keys(obj)) {
    if (!isNaN(obj[key]) && isFinite(obj[key])) {
      ret[key] = obj[key];
    }
  }
  return ret;
}
