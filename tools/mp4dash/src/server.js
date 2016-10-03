/**
 * @flow
 */

import invariant from 'assert';
import http from 'http';
import url from 'url';
import createLog from 'silk-log';

import config from './config';
import connectToSocketIO from './socketio';
import SegmentProviderSocketIo from './segment_provider_socketio';

const log = createLog('server');

const PRETEND_CONTENT_LENGTH = 1024 * 1024 * 1024; // LOL

function parseRange(request): [?number, ?number] {
  let range = request.headers.range;
  if (!range) {
    return [0, null];
  }
  invariant.strictEqual(range.indexOf('bytes='), 0);
  range = range.slice('bytes='.length);
  let [startStr, endStr] = range.split('-');
  let start = null;
  if (startStr) {
    start = parseInt(startStr, 10);
  }
  let end = null;
  if (endStr) {
    end = parseInt(endStr, 10);
  }
  if (end === PRETEND_CONTENT_LENGTH - 1) {
    end = null;
  }
  log.info(
    `  parseRange(${request.headers.range}) -> ` +
    `[${String(start)}, ${String(end)}]`
  );
  return [start, end];
}

function handleOpenEndRequest(provider, request, response, offset): void {
  log.info(`handleOpenEndRequest(${String(offset)})`);
  if (typeof offset === 'number') {
    response.writeHead(206, {
      'content-type': 'video/mp4',
      'content-length': `${PRETEND_CONTENT_LENGTH - offset}`,
      'content-range': `bytes ${offset}-${PRETEND_CONTENT_LENGTH - 1}/${PRETEND_CONTENT_LENGTH}`,
    });
  } else {
    offset = 0;
    response.writeHead(200, {
      'content-type': 'video/mp4',
      'content-length': `${PRETEND_CONTENT_LENGTH}`,
    });
  }

  let totalBytesWritten = 0;
  let writeSegmentToResponse = (segment) => {
    invariant(typeof offset === 'number');
    let buffer = segment.buffer;
    if (segment.offset + buffer.length <= offset) {
      log.info(`  ignoring segment #${segment.seqno} at ${segment.offset}-${segment.offset + buffer.length} (length ${buffer.length})`);
      return;
    }
    if (segment.offset < offset && offset < segment.offset + buffer.length) {
      log.info(`  found partial first segment #${segment.seqno} at ${segment.offset}-${segment.offset + buffer.length} (length ${buffer.length})`);
      buffer = buffer.slice(offset - segment.offset);
    } else {
      log.info(`  serving segment #${segment.seqno} at ${segment.offset}-${segment.offset + buffer.length} (length ${buffer.length})`);
    }

    segment.served = true;
    response.write(buffer, () => {
      log.info(`    wrote ${buffer.length} bytes`);
      totalBytesWritten += buffer.length;
    });
  };
  provider.on('segment', writeSegmentToResponse);

  // ...until the other side has enough.
  response.on('close', () => {
    log.info(`  response prematurely closed, wrote ${totalBytesWritten} in total`);
    provider.removeListener('segment', writeSegmentToResponse);
  });
  response.on('finish', () => {
    log.info(`  response finished, wrote ${totalBytesWritten} in total.`);
    provider.removeListener('segment', writeSegmentToResponse);
  });
}

function handleRangeRequest(provider, request, response, start, end): void {
  log.info(`handleRangeRequest(${String(start)}, ${end})`);
  start = start || 0;
  let segment = provider.findSegmentClosestToOffset(start);
  if (end) {
    // TODO probably have to fix that
    invariant(
      end - start + 1 < segment.buffer.length,
      'Range request must be satisfiable within a single segment'
    );
  }

  let bufferStart = start - segment.offset;
  let buffer = segment.buffer;
  if (end !== null) {
    let bufferLength = end - start + 1;
    buffer = buffer.slice(bufferStart, bufferStart + bufferLength);
  }

  response.writeHead(206, {
    'content-type': 'video/mp4',
    'content-length': `${buffer.length}`,
    'content-range': `bytes ${start}-${end}/${PRETEND_CONTENT_LENGTH}`,
  });
  response.write(buffer, () => {
    log.info(`  wrote ${buffer.length} bytes`);
  });
  response.on('finish', () => {
    log.info('  response finished.');
  });
  response.end();
}

function handleRequest(request, response, socket) {
  log.info('Incoming request', request.method, request.url, request.headers.range);
  invariant.strictEqual(request.method, 'GET');
  let urlInfo = url.parse(request.url);
  invariant(urlInfo.pathname);
  let [deviceId, extension] = urlInfo.pathname.split('.');
  if (extension !== 'mp4') {
    response.writeHead(404);
    response.end();
    return;
  }

  if (deviceId[0] === '/') {
    deviceId = deviceId.slice(1);
  }
  if (deviceId === 'default') {
    deviceId = config.deviceId;
  }
  let provider = SegmentProviderSocketIo.getOrCreate(socket, deviceId);
  let [start, end] = parseRange(request);
  if (typeof end === 'number') {
    handleRangeRequest(provider, request, response, start, end);
  } else {
    handleOpenEndRequest(provider, request, response, start);
  }
}

function main() {
  connectToSocketIO().then((socket) => {
    log.info('Connected to socket.io');
    socket.emit('join', 'video-streams');
    socket.on('video-stream-new', (message) => {
      log.info('video-stream-new', message.id);
    });
    socket.on('video-stream-delete', (message) => {
      log.info('video-stream-delete', message.id);
    });

    let httpServer = http.createServer((request, response) => {
      handleRequest(request, response, socket);
    });
    httpServer.listen(config.port, '0.0.0.0');
  });

  process.on('exit', (code) => {
    log.info(`Exiting with code ${code}`);
  });
}

main();
