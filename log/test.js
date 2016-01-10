var log = require('./index')('foobar');
var deviceLog = require('./device')('foobar-device');

function testLog(log) {
  log.fatal('sos');
  log.error('ono');
  log.warn('tsktsk');
  log.info('hi');
  log.debug('assert(1+1=3)');
  log.verbose('useless');
}

testLog(log);
testLog(deviceLog);
