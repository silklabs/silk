/**
 * Copyright (c) 2015 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

/**
 * The closely linked partner to the "Logcat" stream will format the output of
 * that stream into a syslog friendly format.
 */

import { Transform } from 'stream';
import assert from 'assert';

/**
 * Random priority (see syslog spec) this is only needed for the format to be
 * valid we could use another more valid priority stream if it results in more
 * useful logs.
 */
const PRIORITY = 34;

export default class LogcatToSyslog extends Transform {

  // hostname to send in syslog message...
  host = ''

  constructor(host) {
    super({
      writableObjectMode: true
    });
    assert(typeof host === 'string');
    this.host = host;
    this.once('finish', () => this.emit('close'));
  }

  _transform(log, encoding, callback) {
    let date = new Date(log.utc).toISOString();


    let line = `<${PRIORITY}>1 ${date} ${this.host} ${log.tag} - - - `;

    if (log.pid) {
      line += ` pid=${log.pid}`;
    }

    if (log.tid) {
      line += ` tid=${log.tid}`;
    }

    if (log.priority) {
      line += ` pri=${log.priority}`;
    }

    line += ` ${log.message}`;
    callback(null, new Buffer(line + '\n'));
  }

}
