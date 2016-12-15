/**
 * @noflow
 */

import Speaker from 'silk-speaker';
import fs from 'fs';
import createLog from 'silk-log/device';
const log = createLog('test');

let buffer = fs.readFileSync(process.argv[2]);
let speaker = new Speaker({
  numChannels: 1,
  sampleRate: 16000,
  bytesPerSample: 2,
  encoding: 'signed-integer',
});
speaker.setVolume(1.0);
speaker.on('close', () => log.info(`done`));
speaker.write(buffer);
speaker.end();
