/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @private
 */

/**
 * This module is responsible for handling the various types of JS runtime
 * errors that may occur (such as uncaught exceptions and promise chain
 * rejections that are not handled).
 * @name js_errors
 * @namespace
 */

import { getprop } from 'silk-sysutils';
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

function drainLogcat(destination) {
  try {
    const start = Date.now();

    // -d will drain the current log without tailing.
    // TODO: These logs would be way nicer if they where in descending order
    // rather then ascending.
    let proc = spawn('system/bin/logcat', ['-d', '-v', 'threadtime']);
    proc.on('error', err => {
      log.warn(`drainLogcat() failed: ${err.stack}`);
    });
    log.info('draining logcat...');
    proc.stdout.pipe(destination);

    // Unlike elsewhere we simply wait for `finish` (all the data has been
    // drained).
    proc.stdout.once('finish', () => {
      log.verbose(`Took ${Date.now() - start}ms to drain logcat`);
    });
  } catch (err) {
    log.warn(`Failed to drain logcat: ${err.stack || err}`);
  }
}

export async function buildJSTombstone(type, err) {
  const stream = new Store();
  const header = tombstoneHeader(type, err);
  stream.write(header);
  drainLogcat(stream);
  await eventToPromise(stream, 'finish');
  return stream;
}

export default function(crashreporter) {
  const handleError = async (type, err) => {
    log.info(type, err.stack);
    try {
      const stream = await buildJSTombstone(type, err);
      return crashreporter.reportJSError(err,
                                         type,
                                         stream,
                                         stream.getStoreSize());
    } catch (ex) {
      log.error('Failed to report ${type}', ex);

      try {
        const stream2 = await buildJSTombstone(type, ex);
        return crashreporter.reportJSError(ex,
                                           'uncaughtException',
                                           stream2,
                                           stream2.getStoreSize(),
                                           { failedStack: err.stack }
                                          );
      } catch(ex2) {
        log.error('Failed to report exception while reporting ${type}', ex2);
      }
    }
  };

  process.on('uncaughtException',
             async (err) => handleError('uncaughtException', err));

  process.on('unhandledRejection',
             async (err) => handleError('unhandledRejection', err));
}
