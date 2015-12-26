/**
 * This module is responsible for handling the various types of JS runtime
 * errors that may occur (such as uncaught exceptions and promise chain
 * rejections that are not handled).
 */

import { getprop } from './sysutils';
import { spawn } from 'child_process';
import createLog from './log';
import Store from './streams/store';
import eventToPromise from 'event-to-promise';

const log = createLog('js_errors');

const BUILD_FINGERPRINT = getprop('ro.build.fingerprint');

function formatError(err) {
  return `${err}\n\nbacktrace:\n${err.stack}`;
}

function tombstoneHeader(type, err) {
  return `*** *** *** *** *** *** *** *** *** *** *** *** *** *** *** ***
Build fingerprint: '${BUILD_FINGERPRINT}'
Revision: '1'
ABI: 'js'
Type: '${type}'
${formatError(err)}

`;
}

async function drainLogcat(destination) {
  try {
    // -d will drain the current log without tailing.
    // TODO: These logs would be way nicer if they where in descending order
    // rather then ascending.
    let proc = spawn('/system/bin/logcat', ['-d', '-v', 'threadtime']);
    proc.on('error', err => {
      log.warn(`drainLogcat() failed: ${err.stack}`);
    });
    let start = Date.now();
    log.info('draining logcat...');
    proc.stdout.pipe(destination);

    // Unlike elsewhere we simply wait for `finish` (all the data has been
    // drained).
    await eventToPromise(proc.stdout, 'finish');
    log.verbose(`Took ${Date.now() - start}ms to drain logcat`);
  } catch (err) {
    log.warn(`Failed to drain logcat: ${err.stack || err}`);
  }
}

export async function buildJSTombstone(type, err) {
  let stream = new Store();
  const header = tombstoneHeader(type, err);
  log.error(header);
  stream.write(header);
  await drainLogcat(stream);
  return stream;
}

export default function(crashreporter) {
  process.on('uncaughtException', async (err) => {
    log.info('uncaughtException', err);
    try {
      let stream = await buildJSTombstone('uncaughtException', err);
      await crashreporter.reportJSError(err, 'uncaughtException', stream, stream.getStoreSize());
    } catch (ex) {
      log.error('Failed to report uncaughtException', ex.stack);
    }
  });

  process.on('unhandledRejection', async (err) => {
    log.info('unhandledRejection', err);
    try {
      if (!err) {
        err = new Error(`Unhandled rejection without an error...`);
      }
      let stream = await buildJSTombstone('unhandledRejection', err);
      await crashreporter.reportJSError(err, 'unhandledRejection', stream, stream.getStoreSize());
    } catch (ex) {
      log.error('Failed to report unhandledRejection', ex.stack);
    }
  });
}
