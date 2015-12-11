import fs from 'fs';
import process from 'process';
import createLog from 'log';

import connectToSocketIO from './socketio';
import SegmentProvider from './segment_provider';
import config from './config';

const log = createLog('file-writer');
const { deviceId } = config;

function startRecording(socket) {
  log.info(`startRecording(${deviceId}`);
  let provider = SegmentProvider.get(socket, deviceId);
  let fileStream = fs.createWriteStream('out.mp4', { flags: 'w' });
  let writeSegmentToFile = (segment) => {
    log.info(`Writing segment ${segment.seqno} to file.`);
    fileStream.write(segment.buffer);
  };
  provider.segments.forEach(writeSegmentToFile);
  provider.on('segment', writeSegmentToFile);
}

function main() {
  connectToSocketIO().then((socket) => {
    log.info('Connected to socket.io');
    socket.emit('join', 'video-streams');
    socket.on('video-stream-new', (message) => {
      log.info('video-stream-new', message.id);
      if (message.id === deviceId) {
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
