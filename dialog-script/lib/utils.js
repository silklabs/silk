/**
 * @flow
 */

export function urlEncodeParams(obj: Object): string {
  const list = [];
  Object.keys(obj).forEach(key => {
    list.push(`${encodeURIComponent(key)}=${encodeURIComponent(obj[key])}`);
  });
  return list.join(`&`);
}

