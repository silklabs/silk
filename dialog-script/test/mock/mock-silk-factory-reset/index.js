import EventEmitter from 'events';
import createLog from 'silk-log';

const log = createLog(`mock-silk-factory-reset`);

class FactoryReset extends EventEmitter {
  start() {
    log.info('Initiating a factory reset');
  }
}
let factoryReset = new FactoryReset();
export default factoryReset;
