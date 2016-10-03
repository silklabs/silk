/**
 * Helper for an async version of "assert.throws"
 *
 * @flow
 */

export default async function assertAyncThrows(
  fn: () => Promise<any>,
  contains?: string | RegExp
): Promise<any> {
  try {
    await fn();
  } catch (err) {

    if (!contains) {
      return;
    }

    const {message} = err;

    if (contains instanceof RegExp) {
      if (!contains.test(message)) {
        throw new Error(
          `Expected '${message}' to match regexp: ${String(contains)}`
        );
      }
      return;
    }

    if (message.indexOf(contains) === -1) {
      throw new Error(`Expected: '${message}' to include: ${contains}`);
    }
  }

  throw new Error(`Expected an error did not throw...`);
}
