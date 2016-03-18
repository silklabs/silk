/**
 * Run an express/connect middleware function as a promise.
 *
 * @flow
 */
export default async function runMiddleware(fn: Function, ...args: Array<any>): Promise<any> {
  return new Promise((accept, reject) => {
    args.push((err) => {
      if (err) {
        reject(err);
        return;
      }
      accept();
    });
    fn(...args);
  });
}
