/* @flow */

/**
 * Helper for safely calling the toJSON method if available.
 */
export default function toJSON(obj: any): Object {
  if (typeof obj.toJSON === 'function') {
    return obj.toJSON();
  }
  return obj;
}
