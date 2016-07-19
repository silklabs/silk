/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @flow
 */

import * as net from 'net';
import * as util from 'silk-sysutils';
import createLog from 'silk-log/device';
import events from 'events';
import invariant from 'assert';
import type { Socket } from 'net';

const log = createLog('say');
const TTS_SOCKET_NAME = '/dev/socket/tts';
const TTS_LIB = util.getstrprop('persist.silk.say.lib', '');


type SayInitCommand = {
  cmdName: 'init';
  lib: string;
  lang: string;
  country: string;
  pitch: string;
  rate: string;
  volume: number;
};
type SaySpeakCommand = {
  cmdName: 'speak';
  text: string;
};
type SayCloseCommand = {
  cmdName: 'close';
};
type SayCommand = SayInitCommand | SaySpeakCommand | SayCloseCommand;

/**
 * This is a text to speech module for silk OS
 */
class Say extends events.EventEmitter {
  _ready: boolean;
  _initConfig: SayInitCommand;
  _socket: ?Socket;
  _buffer: string;

  constructor() {
    super();
    util.setprop('ctl.restart', 'silk-tts');
    this._ready = false;
    this._initConfig = {
      cmdName: 'init',
      lib: TTS_LIB,
      lang: 'eng',
      country: 'GBR',
      pitch: '90',
      rate: '90',
      volume: 0.3,
    };
  }

  /**
   * Initialize the {@code Say} module
   */
  init(): void {
    log.verbose(`connecting to ${TTS_SOCKET_NAME} socket`);
    const socket = this._socket = net.connect({path: TTS_SOCKET_NAME}, () => {
      log.verbose(`connected to ${TTS_SOCKET_NAME} socket`);
      this._buffer = '';
      this._ready = true;
      this._command(this._initConfig);
    });
    socket.on('data', data => this._onData(data));
    socket.on('error', err => {
      this._restart(`say error, reason=${err}`);
    });
    socket.on('close', hadError => {
      if (!hadError) {
        this._restart(`say close`);
      }
    });
  }

  /**
   * Speak the provided text
   *
   * @param text to speak
   * @param optionally provide the tts engine to use
   * @return Promise that would be resolved once the text has finished speaking
   */
  speak(text: string, lib: ?string): Promise<void> {
    let initializePromise = Promise.resolve();

    // If user requested for a different library than is currently being used
    // Re-initialize the tts engine with the new library
    if (lib && (lib !== this._initConfig.lib)) {
      this._initConfig.lib = lib;

      initializePromise = new Promise((resolve, reject) => {
        this.once('initialize', () => {
          log.verbose(`Received event initialize`);
          this.removeAllListeners('error');
          resolve();
        });
        this.once('error', (msg) => {
          this.removeAllListeners('done');
          reject(msg);
        });
        this._command({cmdName: 'close'});
        this._command(this._initConfig);
      });
    }

    let ttsPromise = new Promise((resolve, reject) => {
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

    return initializePromise.then(() => {
      return ttsPromise;
    });
  }

  _restart(why: string): void {
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

  _onData(data: Buffer): void {
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

  _command(cmd: SayCommand): void {
    if (!this._ready) {
      log.warn(`tts service not ready, ignoring the command`);
      return;
    }
    const socket = this._socket;
    invariant(socket);

    // tts socket expects the command data in the following format
    const event = JSON.stringify(cmd) + '\0';

    socket.write(event);
    log.verbose(`tts << ${event}`);
  }
}

let say = new Say();
export default say;
