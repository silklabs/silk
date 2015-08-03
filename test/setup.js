import loadConfig from '../src/server/config';
import mongo from 'promised-mongo';

const DB_TIMEOUT = 1500;

function timeout(time) {
  return new Promise((accept) => {
    return setTimeout(accept, time);
  });
}

// Run a one time check to ensure mongodb has been started.
suiteSetup(async function() {
  let config = loadConfig('test');
  let db = mongo(config.db.connectionString);

  await Promise.race([
    db.stats(),
    timeout(DB_TIMEOUT).then(() => {
      throw new Error(`
        Could not connect to: ${config.db.connectionString} in ${DB_TIMEOUT} ms

        This probably means you don't have mongodb running. Please start it before
        running tests.
      `);
    })
  ]);
});
