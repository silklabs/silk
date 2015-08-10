/**
 * This pattern is considered "legacy" don't use it unless you need to do
 * something awkward like loop promises with timers.
 */
export default function deferred() {
  let opts = {};
  opts.promise = new Promise((accept, reject) => {
    opts.accept = accept;
    opts.reject = reject;
  });
  return opts;
}
