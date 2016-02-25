/**
 * @flow
 */

import path from 'path';
import fs from 'fs-extra';
import createLog from 'silk-log';

import connectToSocketIO from './socketio';
import SegmentProviderSocketIO from './segment_provider_socketio';
import config from './config';

import type SegmentProvider from './segment_provider';

const log = createLog('file-writer');

export function startConcatenateWriter(
  provider: SegmentProvider,
  outFile: string
) {
  log.info(`startConcatenateWriter()`);
  if (!outFile) {
    outFile = 'out.mp4';
  }
  let fileStream = fs.createWriteStream(outFile, { flags: 'w' });
  provider.on('init-segment', (segment) => {
    log.info(`Writing initial segment to file.`);
    fileStream.write(segment.buffer);
  });
  provider.on('segment', (segment) => {
    log.info(`Writing segment ${segment.seqno} to file.`);
    fileStream.write(segment.buffer);
  });
  provider.on(`close`, () => {
    log.info(`Finished writing`);
    fileStream.end();
  });
}

export function startSegmentsWriter(
  provider: SegmentProvider,
  outDir: string
) {
  log.info(`startSegmentsWriter()`);
  if (!outDir) {
    outDir = 'segments';
  }
  fs.removeSync(outDir);
  fs.mkdirSync(outDir);
  provider.on('init-segment', (segment) => {
    let file = path.join(outDir, 'seg-init.mp4');
    log.info(`Writing init segment '${path}'.`);
    fs.writeFile(file, segment.buffer);
  });
  provider.on('segment', (segment) => {
    let num = segment.seqno >= 10 ? String(segment.seqno) : `0${segment.seqno}`;
    let file = path.join(outDir, `seg-${num}.m4s`);
    log.info(`Writing segment '${file}'.`);
    fs.writeFile(file, segment.buffer);
  });
}

function startRecording(socket, fileMode, deviceId, outFileOrDir) {
  log.info(`startRecording(${deviceId}`);
  let provider = SegmentProviderSocketIO.getOrCreate(socket, deviceId);
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
