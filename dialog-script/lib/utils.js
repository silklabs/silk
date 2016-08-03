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

// Reference https://www.w3.org/TR/2005/NOTE-ssml-sayas-20050526/#S3.3
type NumberFormat = 'telephone' | 'cardinal' | 'ordinal';

export function encodeNumber(digits: number, format: NumberFormat = 'telephone'): string {
  return `<say-as interpret-as=\"${format}\">${digits}</say-as>`;
}
