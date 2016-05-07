import Player from 'play-sound';
import path from 'path';

import createLog from 'silk-log';
const log = createLog('sysutils');

export default function beep(type, cb) {
  let filenames = {
    startListen: 'hotkeyword_detected.mp3',
    stopListen: 'stopListen.mp3',
    error: 'motion_detected.mp3',
  };

  if (type in filenames) {
    let filename = filenames[type];

    filename = path.join('demo', 'media', filename);
    log.info(`playSound: ${filename}`);

    let player = Player(); // eslint-disable-line new-cap
    player.play(filename, cb);
  } else {
    log.error(`playSound: unknown type '${type}'`);
  }
}
