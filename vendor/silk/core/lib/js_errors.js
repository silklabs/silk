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
  return `${err}:\n\n${err.stack}`;
}

function tombstoneHeader(type, err) {
  return `*** *** *** *** *** *** *** *** *** *** *** *** *** *** *** ***
Build fingerprint: '${BUILD_FINGERPRINT}'
Type: '${type}'
When: '${new Date()}'

${formatError(err)}

`;
}

async function drainLogcat(destination) {
  // -d will drain the current log without tailing.
  // TODO: These logs would be way nicer if they where in descending order
  // rather then ascending.
  let proc = spawn('/system/bin/logcat', ['-d', '-v', 'threadtime']);
  let start = Date.now();
  log.info('draining logcat...');
  proc.stdout.pipe(destination);

  // Unlike elsewhere we simply wait for `finish` (all the data has been
  // drained).
  await eventToPromise(proc.stdout, 'finish');
  log.info('Took %d ms to drain logcat', Date.now() - start);
}

async function handleJSError(type, err) {
  let stream = new Store();
  stream.write(tombstoneHeader(type, err));
  await drainLogcat(stream);
  return stream;
}

export default function(crashreporter) {
  process.on('uncaughtException', async (err) => {
    log.info('uncaughtException', err);
    try {
      let stream = await handleJSError('uncaughtException', err);
      await crashreporter.report(stream);
    } catch (err) {
      log.error('Failed to report uncaughtException', err.stack);
    }
  });

  process.on('unhandledRejection', async (err) => {
    log.info('unhandledRejection', err);
    try {
      if (!err) {
        err = new Error(`Unhandled rejection without an error...`);
      }
      let stream = await handleJSError('unhandledRejection', err);
      await crashreporter.report(stream);
    } catch (err) {
      log.error('Failed to report unhandledRejection', err.stack);
    }
  });
}
