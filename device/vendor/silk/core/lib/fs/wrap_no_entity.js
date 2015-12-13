/**
 * Helper for wrapping ENOENT file system errors.
 *
 * @flow
 */
export default async function wrapNoEntity<T>(
  promise: Promise<T>,
  value: ?T = null
): Promise<?T> {
  try {
    return await promise;
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      return value;
    }
    throw err;
  }
}
