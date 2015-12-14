import fs from 'fs';
import process from 'process';
import createLog from 'log';

import connectToSocketIO from './socketio';
import SegmentProvider from './segment_provider';
import config from './config';

const log = createLog('file-writer');
const { deviceId } = config;

function startConcatenateWriter(provider) {
  log.info(`startConcatenateWriter()`);
  let fileStream = fs.createWriteStream('out.mp4', { flags: 'w' });
  let writeSegmentToFile = (segment) => {
    log.info(`Writing segment ${segment.seqno} to file.`);
    fileStream.write(segment.buffer);
  };
  provider.segments.forEach(writeSegmentToFile);
  provider.on('segment', writeSegmentToFile);
}

function startSegmentsWriter(provider) {
  const SEGMENTS_DIR = 'segments';

  log.info(`startSegmentsWriter()`);
  let writeSegmentToFile = (segment) => {
    // DASH tools like to name the first segment "1".
    let seqno = segment.seqno + 1;
    if (0 === seqno) {
      let path = SEGMENTS_DIR + '/seg-init.mp4';
      log.info(`Writing init segment '${path}'.`);
      fs.writeFile(path, segment.buffer);
      return;
    }
    let path = SEGMENTS_DIR + `/seg-${seqno}.m4s`;
    log.info(`Writing segment '${path}'.`);
    fs.writeFile(path, segment.buffer);
  };
  fs.mkdirSync(SEGMENTS_DIR);
  provider.segments.forEach(writeSegmentToFile);
  provider.on('segment', writeSegmentToFile);
}
    
function startRecording(socket, fileMode) {
  log.info(`startRecording(${deviceId}`);
  let provider = SegmentProvider.get(socket, deviceId);
  switch (fileMode) {
  case 'segments':
      return startSegmentsWriter(provider);
  case 'cat':
      return startConcatenateWriter(provider);
  default:
      throw new Error (`Invalid file-writer mode ${fileMode}`);
  }
}

function main() {
  let fileMode = process.argv.slice(-1)[0];
  log.info(`Using file-writer mode ${fileMode}.`);      

  connectToSocketIO().then((socket) => {
    log.info('Connected to socket.io');
    socket.emit('join', 'video-streams');
    socket.on('video-stream-new', (message) => {
      log.info('video-stream-new', message.id);
      if (message.id === deviceId) {
        startRecording(socket, fileMode);
      }
    });
    socket.on('video-stream-delete', (message) => {
      log.info('video-stream-delete', message.id);
    });
  });

  process.on('exit', (code) => {
    log.info(`Exiting with code ${code}`);
  });
}

main();
