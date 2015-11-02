/**
 * Helper for wrapping ENOENT file system errors.
 */
export default async function wrapNoEntity(promise, value = null) {
  try {
    return await promise;
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      return value;
    }
    throw err;
  }
}
