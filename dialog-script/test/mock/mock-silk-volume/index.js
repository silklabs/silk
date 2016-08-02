import {EventEmitter} from 'events';
import createLog from 'silk-log';
const log = createLog(`mock-volume`);

class Volume extends EventEmitter {
}

let volume = new Volume();
export default volume;
