import fs from 'fs';
import process from 'process';
import createLog from 'log';

import connectToSocketIO from './socketio';
import SegmentProvider from './segment_provider';

const log = createLog('file-writer');

const DEVICE_ID = '032aa987ce505299f31b5317ecd1ca774e4e9a411ad81bc90aec177b9bd935883b';

function startRecording(socket) {
  log.info(`startRecording(${DEVICE_ID}`);
  let provider = SegmentProvider.get(socket, DEVICE_ID);
  let fileStream = fs.createWriteStream('out.mp4', { flags: 'w' });
  let writeSegmentToFile = (segment) => {
    log.info(`Writing segment ${segment.seqno} to file.`);
    fileStream.write(segment.buffer);
  };
  provider.segments.forEach(writeSegmentToFile);
  provider.on('segment', writeSegmentToFile);
}

function main() {
  connectToSocketIO((socket) => {
    log.info('Connected to socket.io');
    socket.emit('join', 'video-streams');
    socket.on('video-stream-new', (message) => {
      log.info('video-stream-new', message.id);
      if (message.id === DEVICE_ID) {
        startRecording(socket);
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
