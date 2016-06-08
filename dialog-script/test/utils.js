import assert from 'assert';

export function testScript(generator, script) {
  assert(generator, `No 'generator' passed`);
  assert(`next` in generator, `Generator doesn't have a 'next' property`);
  assert.strictEqual(typeof generator.next, `function`);

  assert(script, `No 'script' passed`);
  assert(Array.isArray(script), `Script is not an array`);
  assert(script.length, `Script is an empty array`);

  script.forEach((state, index) => {
    try {
      assert(state, `Script[${index}] is empty`);
      assert.equal(typeof state, `object`);

      const keys = Object.keys(state);
      assert(keys.length <= 4, `Script[${index}] has too many keys`);
      keys.forEach((key) => {
        assert(key === `provide` ||
               key === `expect` ||
               key === `error` ||
               key === `done`,
               `Script[${index}] has an unsupported key '${key}'`);
      });

      const {provide, expect, error, done} = state;

      assert(!error || !provide,
             `Script[${index}] has both an 'error' and a 'provide' key`);

      const next = error ?
                   generator.throw(error) :
                   generator.next(provide);
      assert.deepStrictEqual(next.value, expect);
      if (done) {
        assert.strictEqual(next.done, done);
      } else {
        assert(!next.done, `Script[${index}] finished early`);
      }
    } catch(error) {
      console.error(`State[${index}] Error: %s`, error); // eslint-disable-line no-console
      throw error;
    }
  });
}
