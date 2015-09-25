/**
 * Copyright (c) 2015 Silk Laboratories, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Laboratories, Inc.
 */

/**
 * This module is responsible for keeping a logcat process alive and "chunking"
 * the stream into smaller substreams which are suitable for use with outbox.
 */

// This number is totally made up...
const BYTE_MAX = (1024 * 1024) * 5; // 1mb
const TIME_MAX = 1000 * 5; // 100s

import assert from 'assert';
import { spawn } from 'child_process';
import { PassThrough } from 'stream';
import split from 'split';
import createLog from './log';

import LogcatStream from './streams/logcat';
import LogcatToSyslog from './streams/logcat_to_syslog';
import PapertrailOp from './outbox/papertrail_operation';

const log = createLog('logcat');

export default class LogcatManager {

  process = null

  outbox = null
  hostname = null

  _maxReadTimer = null;

  constructor(hostname, outbox) {
    assert(hostname, 'is required...');
    assert(outbox, 'is required...');

    this.hostname = hostname;
    this.outbox = outbox;
  }

  onLogcatErr = err => {
    log.info(`Error in logcat process`, err);
    this.stop();
    this.start();
  }

  onLogcatExit = () => {
    log.info(`Logcat process exit!`);
    this.stop();
    this.start();
  };

  async uploadLogStream(stream) {
    log.info('initializing upload of log...');
    try {
      // Run operation....
      let uploadStream = stream.
        // split the stream into newlines
        pipe(split()).
        // parse into logcat
        pipe(new LogcatStream()).
        // transform the logcat output to syslog
        pipe(new LogcatToSyslog(this.hostname));

      let operation = new PapertrailOp();

      await this.outbox.addToQueue(operation, uploadStream);
    } catch (err) {
      log.error(`Error uploading logcat log: ${err.stack}`);
    }
    log.info('finished upload of log...');
  }

  _spawn() {
    log.info('spawning logcat...');
    this.process = spawn('/system/bin/logcat', ['-v', 'threadtime']);
    this.process.on('error', this.onLogcatErr);
    this.process.on('exit', this.onLogcatExit);
  }

  start() {
    log.info('starting to read from logcat...');
    this._spawn();
    let stream = this.process.stdout;

    let seenData = 0;
    let segment = null;

    let resetState = () => {
      log.verbose('resetting logcat stream state... Creating new stream.');
      if (segment) {
        segment.end();
      }

      seenData = 0;
      segment = new PassThrough();
      clearTimeout(this._maxReadTimer);
      // Ensure the buffer is reset at least this often...
      this._maxReadTimer = setTimeout(resetState, TIME_MAX);

      /**
       * Immediately start the upload with the empty stream (do not wait for a
       * fully buffered stream) this will allow the reader to be drained as it
       * is being written to.
       */
      this.uploadLogStream(segment);
    };

    resetState();
    stream.on('data', buffer => {
      segment.write(buffer);
      seenData += buffer.length;

      if (seenData >= BYTE_MAX) {
        log.verbose(`logcat stream over max bytes: ${seenData}`);
        resetState();
      }
    });
  }

  stop() {
    if (!this.process) {
      log.verbose('no-op stop');
      return;
    }

    this.process.removeListener('error', this.onLogcatErr);
    this.process.removeListener('exit', this.onLogcatExit);

    this.process.kill();
    this.process = null;
  }
}
