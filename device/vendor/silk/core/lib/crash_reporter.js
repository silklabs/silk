/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */
/**
 * Copyright (c) 2015-2016 Silk Laboratories, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Laboratories, Inc.
 */

import assert from 'assert';
import path from 'path';
import fs from 'mz/fs';
import createLog from './log';
import eventToPromise from 'event-to-promise';
import mkdirp from 'mkdirp-promise';
import net from 'net';
import wrapNoEntity from './fs/wrap_no_entity';
import { getboolprop } from './sysutils';
import version from 'silk-core-version';
import raygun from 'silk-raygun/node';
import byline from 'byline';

import CrashReportOp from './outbox/crash_report_operation';
import { EventEmitter } from 'events';

const log = createLog('crash_reporter');

const CRASHREPORT_ENABLED_PROP = 'persist.silk.crashrprt.enabled';
const CRASHREPORT_ENABLED = getboolprop(CRASHREPORT_ENABLED_PROP, version.official);

if (CRASHREPORT_ENABLED) {
  raygun.enable('device', version.semver);
}

const TOMBSTONE_PATH = '/data/tombstones/';
const DEBUGGERD_SOCKET_PATH = '/data/system/ndebugsocket';
const TOMBSTONE_FILE_REGEXP = new RegExp(/^tombstone_\d+$/); // 'tombstone_03'

/**
 * Represents tombstones on disk and manages races around them.
 */
export class Tombstones extends EventEmitter {
  fileQueue = []
  fileSet = new Set()
  tombstonePath = null
  isShutdown = false

  _activePromise = Promise.resolve()

  constructor(tombstonePath) {
    super();
    assert(typeof tombstonePath === 'string');
    this.tombstonePath = tombstonePath;
  }

  async shutdown() {
    this.isShutdown = true;
    await this._activePromise;
  }

  /**
   * Add a new tombstone manually from a readable stream.
   */
  async report(readable) {
    await this.withLock(async () => {
      // update the queue inside of our own lock to prevent races...
      await this.updateQueue();

      let tombstonePath = await this.findFreeTombstoneId();
      let writable = fs.createWriteStream(tombstonePath);
      readable.pipe(writable);
      await eventToPromise(writable, 'close');
      log.info(`reporting tombstone to ${tombstonePath}`);
      await this.addToQueue(tombstonePath);
    });
  }

  update() {
    log.info('Starting search for existing tombstones...');
    return this.withLock(this.updateQueue.bind(this));
  }

  async updateQueue() {
    let tombstones = await this.scan();
    for (let tombstone of tombstones) {
      await this.addToQueue(tombstone);
    }
  }

  async scan() {
    let paths = await wrapNoEntity(fs.readdir(this.tombstonePath), []);
    return paths.filter(value => {
      return value.match(TOMBSTONE_FILE_REGEXP);
    }).map(value => {
      return path.join(this.tombstonePath, value);
    }).sort();
  }

  /**
   * Find a free tombstone id within our custom range.
   *
   * NOTE: This should be run inside of a lock.
   */
  async findFreeTombstoneId(start = 20, end = 40) {
    // Find a free tombstone filename to use in the given range.
    //
    // If all slots are used up the oldest tombstone is overwritten.
    try {
      await mkdirp(this.tombstonePath);
    } catch (err) {
      if (err.code !== 'EEXIST') {
        log.error('Error finding free tombstone id', err);
      }
      // Not much to do here but soldier on...
    }

    let statPromises = [];
    for (let i = start; i < end; i++) {
      statPromises.push(async () => { // eslint-disable-line
        let tombstonePath = path.join(this.tombstonePath, `tombstone_${i}`);
        let stat;
        try {
          stat = await fs.stat(tombstonePath);
          stat.file = tombstonePath;
          stat.free = false;
        } catch (err) {
          if (err.code !== 'ENOENT') {
            log.error('Unexpected error during stat', tombstonePath, err);
          } else {
            stat = { file: tombstonePath, free: true };
          }
        }
        return stat;
      }());
    }

    let tombstones = await Promise.all(statPromises);
    tombstones.filter(tombstone => {
      return !!tombstone.file;
    });

    tombstones.sort((a, b) => {
      let aInt = parseInt(path.basename(a.file).split('_').pop(), 10);
      let bInt = parseInt(path.basename(b.file).split('_').pop(), 10);
      return aInt - bInt;
    });

    let oldestTombstone;
    for (let tombstone of tombstones) {
      // empty tombstone file always wins...
      if (tombstone.free) {
        return tombstone.file;
      }

      // otherwise we compare creation times...
      if (!oldestTombstone || tombstone.birthtime < oldestTombstone.birthtime) {
        oldestTombstone = tombstone;
      }
    }

    return oldestTombstone.file;
  }

  async removeFromQueue(file) {
    if (!this.fileSet.has(file)) {
      return;
    }

    this.fileSet.delete(file);
    let idx = this.fileQueue.indexOf(file);
    if (idx !== -1) {
      this.fileQueue.splice(idx, 1);
    }
  }

  /**
   * Update the internal state of the queue.
   *
   * NOTE: should be run inside a lock!
   */
  async addToQueue(file) {
    if (this.fileSet.has(file)) {
      return;
    }
    log.info(`Found tombstone ${file}`);
    this.fileSet.add(file);
    this.fileQueue.push(file);
    this.emit('tombstone', file);
  }

  withLock(asyncFn) {
    if (this.isShutdown) {
      log.warn(`Attempting to aquire lock after stop has been called...`);
    }

    this._activePromise = this._activePromise.then(asyncFn).catch((err) => {
      log.error(`
        Unexpected error in active promise chain:

        ${err.stack}
      `);
    });

    return this._activePromise;
  }
}

/**
 * DebuggerD server used to hint when new tombstones have been created.
 */
export class Debuggerd extends EventEmitter {

  socketPath = null
  server = null
  connectionCounter = 0

  _startPromise = null

  constructor(socketPath) {
    super();
    assert(typeof socketPath === 'string');
    this.socketPath = socketPath;
  }

  onConnection = async (socket) => {
    // unique id to reference in the logs per connection.
    let id = this.connectionCounter++;
    log.info(`New debuggerd socket connection ${id}`);

    socket.once('error', (err) => {
      log.warn(`Connection ${id} error: ${err.stack}`);
    });

    socket.once('close', () => {
      log.debug(`Connection ${id} ended`);
      this.emit('tombstone written');
    });
  }

  start() {
    if (this._startPromise) {
      return this._startPromise;
    }
    return this._start()
      .then(() => this._startPromise = null)
      .catch((err) => {
        this._startPromise = null;
        throw err;
      });
  }

  async _start() {
    log.info('starting debuggerd socket...', this.socketPath);
    // remove the socket file from disk if present...
    try {
      await fs.unlink(this.socketPath);
    } catch (err) {
      if (err.code !== 'ENOENT') {
        throw err;
      }
    }

    this.server = net.createServer();
    this.server.on('connection', this.onConnection);
    this.server.listen(this.socketPath);
    await eventToPromise(this.server, 'listening');
    log.info('started debuggerd socket...');
  }

  async shutdown() {
    // wait for clean startup if needed...
    if (this._startPromise) {
      await this._startPromise;
    }

    this.server.close();
    await eventToPromise(this.server, 'close');
  }
}

export class CrashReporter {
  outbox = null;
  tombstones = null;
  debuggerd = null;
  active = false;
  deviceId = null;
  doUploads = false;

  constructor(outbox, tombstones, debuggerd, doUploads) {
    Object.assign(this, {
      outbox, tombstones, debuggerd, doUploads
    });

    // if we are actively uploading crashes hook up the listeners to create
    // tombstones...
    if (doUploads) {
      log.info('Crash reporting uploads enabled');
      // We only listen for tombstone creation if we are actively doing uploads.
      debuggerd.on('tombstone written', () => {
        tombstones.update();
      });
      /**
       * The tombstone event is emitted only when a new tombstone has been added
       * to the file queue...
       */
      tombstones.on('tombstone', this.uploadTombstone);
    } else {
      log.info('Crash reporting uploads disabled');
    }
  }

  // Converts a tombstone backtrace into a raygun.io error object
  static async _tombstoneToRaygunError(tombstoneFile) {
    const escape = (str) => str.replace(/[\\$'"]/g, '\\$&');

    // Read in the first part of the tombstone line-by-line
    let fsStream = fs.createReadStream(tombstoneFile, {
      encoding: 'utf8',
      start: 0,
      end: 0xFFFF, // Only bother reading the first 64KB of the tombstone
    });
    let stream = byline(fsStream, { keepEmptyLines: true });

    // Populate the tombstone header and backtrace arrays
    let header = [];
    let backtrace = [];
    let lines = header;
    stream.on('data', (line) => {
      lines.push(line);
      if (line.length === 0) {
        // The first empty line denotes the start of the backtrace.
        // The second empty line denotes the end of the backtrace.
        if (lines === header) {
          lines = backtrace; // Switch over to collecting the backtrace
        } else {
          lines = []; // Ignore the rest of the input
          fsStream.destroy();
        }
      }
    });

    await eventToPromise(fsStream, 'close');

    // Validate the header
    assert.equal(header[0], `*** *** *** *** *** *** *** *** *** *** *** *** *** *** *** ***`);
    assert(header[1].startsWith('Build fingerprint:'));
    assert(header[2].startsWith('Revision:'));
    assert(header[3].startsWith('ABI:'));

    // Line 4: The process that crashed
    const who = escape(header[4].replace(/.*name: /, ''));

    // Line 5: How it crashed
    const message = escape(header[5]);

    // Decode the backtrace lines
    assert(backtrace.length > 1, null);
    assert.equal(backtrace.shift(), `backtrace:`);
    assert.equal(backtrace.pop(), ``);

    var fileMethodRegEx = /^([^ ]*) \((.*)\)$/;
    var methodOffsetRegEx = /^([^+]*)\+(.*)$/;
    const stackTrace = backtrace.map(bt => {
      bt = bt.trim();
      bt = bt.replace(/^.* {2}/, ''); // Remove frame number/pc/stack value

      let frame = { fileName: '?', methodName: '?', lineNumber: '?' };
      const methodInfo = bt.match(fileMethodRegEx);
      if (methodInfo) {
        frame.fileName = escape(methodInfo[1]);

        // The method may contain an +offset
        const methodOffsetInfo = methodInfo[2].match(methodOffsetRegEx);
        if (methodOffsetInfo) {
          frame.methodName = escape(methodOffsetInfo[1]);
          frame.lineNumber = escape(methodOffsetInfo[2]);
        } else {
          frame.methodName = escape(methodInfo[2]);
        }
      } else {
        frame.fileName = escape(bt);
      }
      return frame;
    });

    // Conforms to the "details.error" object at
    // https://raygun.io/raygun-providers/rest-json-api
    return {
      stackTrace,
      message,
      className: who, // Shim the process name into the Error className
    };
  }

  uploadTombstone = (tombstonePath) => {
    log.info(`Handing off ${tombstonePath} to be uploaded...`);
    // We must do this inside of the tombstone lock so we don't race to modify
    // the queue...
    return this.tombstones.withLock(async () => {

      let raygunMessage;
      try {
        raygunMessage = raygun.buildMessage(null, {version});
        raygunMessage.details.error = await CrashReporter._tombstoneToRaygunError(tombstonePath);
      } catch (err) {
        // If _tombstoneToRaygunError fails, report the failure to raygun
        raygunMessage = raygun.buildMessage(err, {version});
      }

      // construct the operation from the current deviceId + stats.
      let stats = await fs.stat(tombstonePath);
      let operation = new CrashReportOp({
        size: stats.size,
        raygunMessage,
        metadata: {
          timeStamp: stats.birthtime,
          type: 'tombstone'
        }
      });

      // Add to the outbox queue this will _remove_ the tombstone. It is now
      // managed by the outbox itself.
      await this.outbox.addToQueue(operation, tombstonePath);
      this.tombstones.removeFromQueue(tombstonePath);
    });
  }

  getDeviceId() {
    if (this.deviceId) {
      return this.deviceId;
    }
    log.warn('Using 0-padded deviceId');
    return new Array(67).join('0');
  }

  assignDeviceId(value) {
    log.info('Assigning device id', value);
    this.deviceId = value.toString();
    // Now that we have the deviceId kick off the initial scan for tombstones.
    return this.tombstones.update();
  }

  async start() {
    // start the debuggerd socket...
    await this.debuggerd.start();
    // If we have the device id by this point kick off the scan for tombstones.
    if (this.deviceId) {
      this.tombstones.update();
    }
  }

  async shutdown() {
    await Promise.all([
      this.tombstones.shutdown(),
      this.debuggerd.shutdown()
    ]);
  }

  async reportJSError(error, type, readable, readableSize) {
    if (this.doUploads) {
      let raygunMessage = raygun.buildMessage(error, {
        jsErrorType: type,
        version,
      });

      let operation = new CrashReportOp({
        size: readableSize,
        raygunMessage,
        metadata: {
          timeStamp: (new Date()).toISOString(), // Accurate enough...
          type: 'tombstone',
        }
      });
      await this.outbox.addToQueue(operation, readable);
    } else {
      // Uploads are disabled.  Store the JS error as a normal tombstone in the
      // hopes that somebody will spot it.
      this.tombstones.report(readable);
    }
  }
}

export default function(outbox, options = {}) {
  let tombstones = new Tombstones(
    options.tombstonePath || TOMBSTONE_PATH
  );

  let debuggerd = new Debuggerd(
    options.debuggerdSocketPath || DEBUGGERD_SOCKET_PATH
  );

  let doUploads = CRASHREPORT_ENABLED;
  if ('crashReporterEnabled' in options) {
    doUploads = options.crashReporterEnabled;
  }

  let crashReporter = new CrashReporter(
    outbox,
    tombstones,
    debuggerd,
    doUploads
  );

  // start the dependant services...
  crashReporter.start()
  .catch(err => {
    log.error('crashReporter failed to start:', err.stack);
  });

  return {
    report: (readable) => tombstones.report(readable),
    reportJSError: (error, type, readable, readableSize) =>
      crashReporter.reportJSError(error, type, readable, readableSize),
    shutdown: () => crashReporter.shutdown(),
    assignDeviceId: (value) => crashReporter.assignDeviceId(value),
  };
}
