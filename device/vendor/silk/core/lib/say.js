/**
 * Copyright (c) 2015 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

import * as util from './sysutils';
import events from 'events';
import net from 'net';
import createLog from './log';

const log = createLog('say');

const TTS_SOCKET_NAME = '/dev/socket/tts';

/**
 * This is a text to speech module for silk OS
 */
export default class Say extends events.EventEmitter {
  constructor() {
    super();
    this._ready = false;
  }

  /**
   * Initialize the {@code Say} module
   */
  init() {
    log.verbose(`connecting to ${TTS_SOCKET_NAME} socket`);
    this._socket = net.createConnection(TTS_SOCKET_NAME, () => {
      log.verbose(`connected to ${TTS_SOCKET_NAME} socket`);
      this._buffer = '';
      this._ready = true;
      this._command({cmdName: 'init', lang: 'eng', country: 'USA'});
    });
    this._socket.on('data', data => this._onData(data));
    this._socket.on('error', err => {
      this._restart(`say error, reason=${err}`);
    });
    this._socket.on('close', hadError => {
      if (!hadError) {
        this._restart(`say close`);
      }
    });
  }

  /**
   * Speak the provided text
   *
   * @param text to speak
   * @return Promise that would be resolved once the text has finished speaking
   */
  speak(text) {
    return new Promise((resolve, reject) => {
      this.once('done', () => {
        this.removeAllListeners('error');
        resolve();
      });
      this.once('error', (msg) => {
        this.removeAllListeners('done');
        reject(msg);
      });
      this._command({cmdName: 'speak', text});
    });
  }

  _restart(why) {
    if (this._socket) {
      this._ready = false;
      this._socket = null;

      log.info(`say restart: ${why}`);
      util.timeout(1000)
      .then(() => this.init());
      return;
    }
    log.info(`restart pending (ignored "${why}")`);
  }

  _onData(data) {
    log.debug(`received data: ${data.toString()}`);
    this._buffer += data.toString();

    let nullByte;
    while ((nullByte = this._buffer.indexOf('\0')) !== -1) {
      let line = this._buffer.substring(0, nullByte);
      this._buffer = this._buffer.substring(nullByte + 1);

      let found;
      if ((found = line.match(/^([\d]*) (.*)/))) {
        line = found[2];
      }

      let ttsEvent = JSON.parse(line);
      if (ttsEvent.eventName === 'initialized') {
        this.emit('initialize');
      } else if (ttsEvent.eventName === 'done') {
        this.emit('done');
      } else if (ttsEvent.eventName === 'error') {
        log.warn('Received "error" from tts service');
      } else {
        log.warn(`Error: Unknown say command ${line}`);
      }
    }
  }

  _command(cmd) {
    if (!this._ready) {
      log.warn(`tts service not ready, ignoring the command`);
      return;
    }

    // tts socket expects the command data in the following format
    let event = JSON.stringify(cmd) + '\0';

    this._socket.write(event);
    log.verbose(`tts << ${event}`);
  }
}
