/**
 * @noflow
 */

import Speaker from 'silk-speaker';
import fs from 'fs';
import createLog from 'silk-log';
const log = createLog('test');

let stream = fs.createReadStream(process.argv[2]);
let speaker = new Speaker({
  numChannels: 1,
  sampleRate: 16000,
  bytesPerSample: 2,
  encoding: 'signed-integer',
});
speaker.setVolume(1.0);
speaker.on('close', () => log.info(`done`));
speaker.on('error', (err) => log.error(err));
stream.on('data', (data) => speaker.write(data));
stream.on('end', () => speaker.end());
