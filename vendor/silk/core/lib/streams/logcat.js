/**
 * Transforms logcat streams into something nicer...
 */

import { Transform } from 'stream';

export default class Logcat extends Transform {

  // Buffer up messages which do not have any date of their own so we can
  // attempt to assign one...
  _pendingMessages = [];
  _lastTimestamp = new Date();
  _year = new Date().getFullYear();

  constructor() {
    super();
    this._readableState.objectMode = true;
  }

  _sendPendingMessages(utc) {
    if (this._pendingMessages.length) {
      for (let message of this._pendingMessages) {
        this.push({
          utc,
          message
        });
      }
      this._pendingMessages = [];
    }
  }

  _flush(callback) {
    // The worst thing is omitting messages so flush any remaining messages
    // there may be with either the last seen date or today.
    this._sendPendingMessages(this._lastTimestamp);
    callback();
  }

  _transform(chunk, encoding, callback) {
    /**
     * logcat has a number of formats we only attempt to parse the threadtime
     * format which has a number of fixed length fields which make parsing this
     * fairly easy.
     *
     * %m-%d %H:%M:%S.000 00000 00000 C
     * ^^^^^^^1^^^^^^.^2^ ^^3^^ ^^4^^ 5
     *
     * 1: stftime format of the data (no year)
     * 2: milliseconds
     * 3: Process ID
     * 4: Thread ID
     * 5: Single char for priority
     *
     * @see https://github.com/android/platform_system_core/blob/android-sdk-4.0.3_r1/liblog/logprint.c
     */

    let string = chunk.toString();

    // Skip of garbage info start chunks...
    if (string.slice(0, 3) === '---' || string.length < 18) {
      this._pendingMessages.push(string);
      callback();
      return;
    }

    // We don't get year so fake it!
    let year = new Date().getFullYear();

    let month = parseInt(string.slice(0, 2), 10);
    let day = parseInt(string.slice(3, 5), 10);
    let hour = parseInt(string.slice(6, 8), 10);
    let minute = parseInt(string.slice(9, 11), 10);
    let second = parseInt(string.slice(12, 14), 10);
    let ms = parseInt(string.slice(15, 18), 10);

    let utc = Date.UTC(
      year,
      month - 1, // Remember JS months start at 0 (Jan = 0)
      day,
      hour,
      minute, // Yes this will accept values other then 0-59
      second,
      ms
    );
    this._lastTimestamp = utc;

    let pid = string.slice(19, 24).trim();
    let tid = string.slice(25, 30).trim();
    let priority = string.slice(31, 32);

    // figure out where the tag ends...
    let tagEnd = string.indexOf(':', 33);
    let tag = string.slice(33, tagEnd).trim();
    let message = string.slice(tagEnd + 2);

    // Send any pending messages with simulated dates...
    this._sendPendingMessages(utc);
    this.push({
      utc,
      pid,
      tid,
      priority,
      tag,
      message
    });
    callback();
  }

}
