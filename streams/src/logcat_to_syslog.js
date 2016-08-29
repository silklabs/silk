/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @private
 * @flow
 */

import { Transform } from 'stream';
import invariant from 'assert';


 // Random priority (see syslog spec) this is only needed for the format to be
 // valid we could use another more valid priority stream if it results in more
 // useful logs.
const PRIORITY = 34;

/**
 * The closely linked partner to the "Logcat" stream will format the output of
 * that stream into a syslog friendly format.
 */
export default class LogcatToSyslog extends Transform {

  // hostname to send in syslog message...
  host: string = '';

  constructor(host: string) {
    super({
      writableObjectMode: true,
    });
    invariant(typeof host === 'string');
    this.host = host;
    this.once('finish', () => this.emit('close'));
  }

  _transform(
    log: any,
    encoding: string,
    callback: (error: ?Error, data?: Buffer | string) => void
  ) {
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
