/**
 * @flow
 */

export function uptime(start?: number): number {
  let end = process.hrtime();
  let endMs = (end[0] * 1000) + (end[1] / 1000000);

  let diffMs = endMs - (start ? start : 0);
  return diffMs;
}

export function getstrprop(prop: string, defaultValue?: string): string {
  return 'mock-' + prop;
}
