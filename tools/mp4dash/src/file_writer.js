import path from 'path';
import fs from 'fs-extra';
import process from 'process';
import createLog from 'silk-log';

import connectToSocketIO from './socketio';
import SegmentProvider from './segment_provider';
import config from './config';

const log = createLog('file-writer');

function startConcatenateWriter(provider, outFile) {
  log.info(`startConcatenateWriter()`);
  if (!outFile) {
    outFile = 'out.mp4';
  }
  let fileStream = fs.createWriteStream(outFile, { flags: 'w' });
  let writeSegmentToFile = (segment) => {
    log.info(`Writing segment ${segment.seqno} to file.`);
    fileStream.write(segment.buffer);
  };
  provider.segments.forEach(writeSegmentToFile);
  provider.on('segment', writeSegmentToFile);
}

function startSegmentsWriter(provider, outDir) {
  log.info(`startSegmentsWriter()`);
  if (!outDir) {
    outDir = 'segments';
  }
  let writeSegmentToFile = (segment) => {
    // DASH tools like to name the first segment "1".
    let seqno = segment.seqno + 1;
    if (0 === seqno) {
      let file = path.join(outDir, 'seg-init.mp4');
      log.info(`Writing init segment '${path}'.`);
      fs.writeFile(file, segment.buffer);
      return;
    }
    let file = path.join(outDir, `seg-${seqno}.m4s`);
    log.info(`Writing segment '${file}'.`);
    fs.writeFile(file, segment.buffer);
  };
  fs.removeSync(outDir);
  fs.mkdirSync(outDir);
  provider.segments.forEach(writeSegmentToFile);
  provider.on('segment', writeSegmentToFile);
}

function startRecording(socket, fileMode, deviceId, outFileOrDir) {
  log.info(`startRecording(${deviceId}`);
  let provider = SegmentProvider.get(socket, deviceId);
  switch (fileMode) {
  case 'segments':
    return startSegmentsWriter(provider, outFileOrDir);
  case 'cat':
    return startConcatenateWriter(provider, outFileOrDir);
  default:
    throw new Error(`Invalid file-writer mode ${fileMode}`);
  }
}

function main() {
  let [/*node*/, /*script*/, fileMode, deviceId, outFileOrDir] = process.argv;
  if (!deviceId) {
    deviceId = config.deviceId;
  }
  log.info(`Using file-writer mode ${fileMode}.`);

  connectToSocketIO().then((socket) => {
    log.info('Connected to socket.io');
    socket.emit('join', 'video-streams');
    socket.on('video-stream-new', (message) => {
      log.info('video-stream-new', message.id);
      if (message.id === deviceId) {
        startRecording(socket, fileMode, deviceId, outFileOrDir);
      }
    });
    socket.on('video-stream-delete', (message) => {
      log.info('video-stream-delete', message.id);
    });
  }).catch((error) => {
    log.error('Connecting to socket.io failed:', error.stack);
  });

  process.on('exit', (code) => {
    log.info(`Exiting with code ${code}`);
  });
}

main();
