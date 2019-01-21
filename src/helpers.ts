export function copyObj(obj: any): any {
  return JSON.parse(JSON.stringify(obj));
}
