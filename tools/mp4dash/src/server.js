import assert from 'assert';
import http from 'http';
import process from 'process';
import url from 'url';
import createLog from 'log';

import connectToSocketIO from './socketio';
import SegmentProvider from './segment_provider';

const log = createLog('server');

const HTTP_PORT = 9999;
const SOCKET_IO_SERVER = 'http://localhost:5001';
const PRETEND_CONTENT_LENGTH = 1024 * 1024 * 1024; // LOL

function parseRange(request): [?number, ?number] {
  let range = request.headers.range;
  if (!range) {
    return [0, null];
  }
  assert.strictEqual(range.indexOf('bytes='), 0);
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
  log.info(`  parseRange(${request.headers.range}) -> [${start}, ${end}]`);
  return [start, end];
}

function handleOpenEndRequest(provider, request, response, offset) {
  log.info(`handleOpenEndRequest(${offset})`);
  if (offset === null) {
    offset = 0;
    response.writeHead(200, {
      'content-type': 'video/mp4',
      'content-length': PRETEND_CONTENT_LENGTH,
    });
  } else {
    response.writeHead(206, {
      'content-type': 'video/mp4',
      'content-length': PRETEND_CONTENT_LENGTH - offset,
      'content-range': `bytes ${offset}-${PRETEND_CONTENT_LENGTH - 1}/${PRETEND_CONTENT_LENGTH}`,
    });
  }

  let totalBytesWritten = 0;
  let writeSegmentToResponse = (segment) => {
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
    response.write(buffer, null, () => {
      log.info(`    wrote ${buffer.length} bytes`);
      totalBytesWritten += buffer.length;
    });
  };
  // Write all the already existing and any upcoming segments to the response.
  provider.segments.forEach(writeSegmentToResponse);
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

function handleRangeRequest(provider, request, response, start, end) {
  log.info(`handleRangeRequest(${start}, ${end})`);
  start = start || 0;
  let segment = provider.findSegmentClosestToOffset(start);
  if (end) {
    // TODO probably have to fix that
    assert(
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
    'content-length': buffer.length,
    'content-range': `bytes ${start}-${end}/${PRETEND_CONTENT_LENGTH}`,
  });
  response.write(buffer, null, () => {
    log.info(`  wrote ${buffer.length} bytes`);
  });
  response.on('finish', () => {
    log.info('  response finished.');
  });
  response.end();
}

function handleRequest(request, response, socket) {
  log.info('Incoming request', request.method, request.url, request.headers.range);
  assert.strictEqual(request.method, 'GET');
  let urlInfo = url.parse(request.url);
  let [deviceId, extension] = urlInfo.pathname.split('.');
  if (extension !== 'mp4') {
    response.writeHead(404);
    response.end();
    return;
  }

  if (deviceId[0] === '/') {
    deviceId = deviceId.slice(1);
  }
  let provider = SegmentProvider.get(socket, deviceId);
  let [start, end] = parseRange(request);
  if (end === null) {
    handleOpenEndRequest(provider, request, response, start);
  } else {
    handleRangeRequest(provider, request, response, start, end);
  }
}

function main() {
  connectToSocketIO((socket) => {
    log.info('Connected to socket.io');
    socket.emit('join', 'video-streams');
    socket.on('video-stream-new', (message) => {
      log.info('video-stream-new', message.id);
    });
    socket.on('video-stream-delete', (message) => {
      log.info('video-stream-delete', message.id);
    });
  });

  let http_server = http.createServer();
  http_server.on('request', (request, response) => {
    handleRequest(request, response, socket);
  });
  http_server.listen(HTTP_PORT, '0.0.0.0');

  // Prime the init segment.
  SegmentProvider.getInitSegment();

  process.on('exit', (code) => {
    log.info(`Exiting with code ${code}`);
  });
}

main();
