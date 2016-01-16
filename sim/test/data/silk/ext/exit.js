/**
 * Test extension that forces the device process to exit after a fixed time
 */
const timeout = 30;

module.exports = (env) => {
  env.log.info('Exit scheduled for', timeout, 'seconds');
  setTimeout(() => {
    env.log.info('Exiting after', timeout, 'seconds');
    process.exit(0);
  }, timeout * 1000);
}

