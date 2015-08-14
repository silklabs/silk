/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

let log = require('./log')('mic');
import { EventEmitter } from 'events';
let util = require('./util');
let net = require('net');

//
// Constants
//
const MIC_CTL_SOCKET_NAME = '/dev/socket/micctl';
const MIC_DATA_SOCKET_NAME = '/dev/socket/micd';
const MIC_COMMAND_NAME = 'MicCommand';

const HEADER_NR_BYTES = 16;
const TAG_AUDIO = 10;

// Manages Mic service. Starts/stops mic stream and emits mic pcm data.
class Mic extends EventEmitter {
  constructor() {
    super();
    this._ctrlSocket = null;
    this._dataSocket = null;
    this._ctrlSocketReady = false;
    this._dataSocketReady = false;
    this._state = 'stop';
    this._startParams = {
      audioSampleRate: 8000,
      audioChannels: 1
    };
  }

  _restart(why) {
    log.info(`mic restart: ${why}`);
    util.timeout(1000)
    .then(() => this._init())
    .catch(util.processthrow);
  }

  _init() {
    if (!this._dataSocket) {
      log.verbose('connecting to socket:', MIC_DATA_SOCKET_NAME);
      this._dataSocket = net.createConnection(MIC_DATA_SOCKET_NAME, () => {
        log.verbose('connected to socket:', MIC_DATA_SOCKET_NAME);
        this._dataSocketReady = true;
        this._dataBuffer = new Buffer(0);
        this._doStartStop();
      });
      this._dataSocket.on('data', data => this._onDataSocketRead(data));
      this._dataSocket.on('error', err => {
        log.error(`mic data socket error, reason=${err}`);
      });
      this._dataSocket.on('close', hadError => {
        this._dataSocketReady = false;
        this._dataSocket = null;
        this._restart('mic data socket close, hasError:', hadError);
      });
    }

    if (!this._ctrlSocket) {
      log.verbose('connecting to socket:', MIC_CTL_SOCKET_NAME);
      this._ctrlSocket = net.createConnection(MIC_CTL_SOCKET_NAME, () => {
        log.verbose('connected to socket:', MIC_CTL_SOCKET_NAME);
        this._ctrlSocketReady = true;
        this._buffer = '';
        this._doStartStop();
      });
      this._ctrlSocket.on('data', data => this._onCtlSocketRead(data));
      this._ctrlSocket.on('error', err => {
        log.error(`mic control socket error, reason=${err}`);
      });
      this._ctrlSocket.on('close', hadError => {
        this._ctrlSocketReady = false;
        this._ctrlSocket = null;
        this._restart('mic control socket close, hasError:', hadError);
      });
    }
  }

  _onCtlSocketRead(data) {
    log.verbose(`received ctrl data: ${data.toString()}`);
    this._buffer += data.toString();

    let nullByte;
    while ((nullByte = this._buffer.indexOf('\0')) !== -1) {
      let line = this._buffer.substring(0, nullByte);
      this._buffer = this._buffer.substring(nullByte + 1);

      let found;
      if ((found = line.match(/^([\d]*) (.*)/))) {
        line = found[2];
      }

      let captureEvent = JSON.parse(line);
      if (captureEvent.eventName === 'error') {
        this.emit('error');
      } else if (captureEvent.eventName === 'start') {
        log.info('Mic started');
        this.emit('start');
      } else if (captureEvent.eventName === 'stop') {
        log.info('Mic stopped');
        this.emit('stop');
      } else {
        log.warn(`Error: Unknown mic command ${line}`);
      }
    }
  }

  _doStartStop() {
    if (!this.ready()) {
      this._init();
    } else {
      if (this._state === 'start') {
        log.info('Starting mic...');
        this._command({cmdName: 'start', cmdData: this._startParams});
      } else {
        log.info('Stopping mic...');
        this._command({cmdName: 'stop', cmdData: {}});
      }
    }
  }

  _onDataSocketRead(data) {
    this._dataBuffer = Buffer.concat([this._dataBuffer, data]);
    while (this._dataBuffer.length >= HEADER_NR_BYTES) {
      let size = this._dataBuffer.readInt32LE(0);
      if (this._dataBuffer.length < HEADER_NR_BYTES + size) {
        break;
      }
      let tag = this._dataBuffer.readInt32LE(4);
      let sec = this._dataBuffer.readInt32LE(8);   // timeval.tv_sec
      let usec = this._dataBuffer.readInt32LE(12); // timeval.tv_usec
      let when = sec * 1000 + Math.round(usec / 1000); // UTC ms since epoch

      let pkt = this._dataBuffer.slice(HEADER_NR_BYTES, HEADER_NR_BYTES + size);
      switch (tag) {
        case TAG_AUDIO:
          //log.info('audio:', size, tag, sec, usec);
          this.emit('data', {frame: pkt, when: when});
          break;
        default:
          throw new Error(`Invalid mic tag: ${tag}`);
      }

      // put the rest of the buffer back
      let rest = new Buffer(this._dataBuffer.length - (HEADER_NR_BYTES + size));
      this._dataBuffer.copy(rest, 0, HEADER_NR_BYTES + size);
      this._dataBuffer = rest;
    }
  }

  _command(cmd) {
    if (!this.ready()) {
      log.warn(`mic service not ready, ignoring the command`);
      return;
    }

    // Mic socket expects the command data in the following format
    let event = MIC_COMMAND_NAME + ' ' + '\"' +
      util.escape(JSON.stringify(cmd)) + '\"' + '\0';

    this._ctrlSocket.write(event);
    log.verbose(`mic << ${event}`);
  }

  ready() {
    return (this._ctrlSocketReady && this._dataSocketReady);
  }

  start() {
    log.info('Starting mic...');
    this._state = 'start';
    this._doStartStop();
  }

  stop() {
    log.info('Stopping mic...');
    this._state = 'stop';
    this._doStartStop();
  }
}

let mic = new Mic();
module.exports = mic;
