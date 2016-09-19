/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @flow
 */

import {spawn} from 'child_process';
import EventEmitter from 'events';

import type {ChildProcess} from 'child_process';
import type {ChannelEventEmitter} from './connections';

import createLog from 'silk-log/device';

const log = createLog('diag');

type DiagRebootEventData = {
  channel: ?string;  // If !null, move the device to the new update channel
};

class DiagLogger {
  channel: ChannelEventEmitter;
  cmd: string;
  data: string;
  name: string;
  params: Array<string>;
  respawnDelaySecs: ?number;
  respawnTimer: ?number;
  sendIntervalId: ?number;
  helper: ?ChildProcess;

  // respawnDelay specifies amount of time to wait after process dies before
  // running the command again. Use null for "streaming logs" that should be
  // running at all times.
  constructor(channel: ChannelEventEmitter,
              name: string,
              cmd: string,
              params: Array<string>,
              respawnDelaySecs: ?number) {
    Object.assign(this, {
      channel,
      cmd,
      data: '',
      helper: null,
      name,
      params,
      respawnDelaySecs,
      respawnTimer: null,
      sendIntervalId: null,
    });
  }

  start() {
    log.info('Spawning', this.cmd);
    let helper = spawn(this.cmd, this.params);

    this.data = '';
    helper.stdout.on('data', data => {
      this.data += data.toString();
    });

    if (!this.respawnDelaySecs) {
      // For a streaming log (eg, logcat) send data once a second
      this.sendIntervalId = setInterval(() => {
        this.send();
        this.data = '';
      }, 1000);
    } else {
      // For a non-streaming log (eg, dash) collect all the data and send it
      // in one shot once the process exits.
      helper.on('close', () => {
        this.send(true);
        if (this.respawnDelaySecs) {
          this.respawnTimer = setTimeout( () => {
            this.start();
            this.respawnTimer = null;
          }, this.respawnDelaySecs * 1000);
        }
      });
    }

    this.helper = helper;
  }

  send(dumpTologcat: boolean = false) {
    if (this.data.length === 0) {
      return;
    }

    if (this.channel.open) {
      this.channel.emit('logchunk', {
        log: this.data,
        name: this.name,
        type: 'log',
      });
    }

    if (dumpTologcat) {
      // Dump as well for convenience
      const lines = this.data.split('\n');
      log.info(`${this.cmd}:`);
      lines.forEach(l => log.verbose(l));
    }
  }

  stop() {
    const helper = this.helper;
    if (helper) {
      helper.removeAllListeners('close'); // to not respawn on close event
      helper.kill();
      this.helper = null;
    }
    if (this.respawnTimer) {
      clearTimeout(this.respawnTimer);
      this.respawnTimer = null;
    }
    if (this.sendIntervalId) {
      clearInterval(this.sendIntervalId);
      this.sendIntervalId = null;
    }
  }

}

export default class Diag extends EventEmitter {
  _loggers: Array<DiagLogger>

  constructor(channel: ChannelEventEmitter) {
    super();
    this._loggers = [
      new DiagLogger(channel, 'logcat',
        'system/bin/logcat',
        /* "-T 0" to skip to the current tip of logcat data. Diag starts up
           immediately at boot before the device connects to the server so any
           existing scroll back will be lost anyway */
        ['-v', 'threadtime', '-T', '0']),

      new DiagLogger(channel, 'dash',
        'system/silk/bin/dash', [], 60),
    ];

    channel.on('hello', () => {
      // Send the latest data immediately
      this._loggers.forEach(logger => logger.send());
    });
    channel.on('reboot', this._onReboot);
  }

  start() {
    log.info('Starting diag service');
    this._loggers.forEach(logger => logger.start());
  }

  stop() {
    log.info('Stopping diag service');
    this._loggers.forEach(logger => logger.stop());
  }

  _onReboot = (untrusted: Object) => {
    let data: DiagRebootEventData = {};
    switch (untrusted.channel) {
    case 'master':
    case 'next':
    case 'release':
      data.channel = untrusted.channel;
      break;
    case '':
      break;
    default:
      log.error('Invalid channel, ignoring command');
      return;
    }
    this.emit('reboot', data);
  }
}
