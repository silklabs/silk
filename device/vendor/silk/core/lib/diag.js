/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

import createLog from './log';
const log = createLog('diag');


class DiagLogger {
  // respawnDelay specifies amount of time to wait after process dies before
  // running the command again. Use null for "streaming logs" that should be
  // running at all times.
  constructor(type, cmd, params, respawnDelaySecs) {
    this.type = type;
    this.respawnTimer = null;
    this.helper = null;
    this.socket = null;
    this.data = '';
    this.config(cmd, params, respawnDelaySecs);
  }

  _launch() {
    log.info('Spawning', this.cmd);
    let spawn = require('child_process').spawn;
    let helper = spawn(this.cmd, this.params);

    if (!this.respawnDelaySecs) {
      // For a streaming log (eg, logcat) send data as fast as it arrives
      helper.stdout.on('data', data => {
        if (this.socket) {
          this.socket.emit('diag', {
            type: this.type,
            log: data.toString()
          });
        }
      });
    } else {
      this.data = '';

      // For a non-streaming log (eg, dash) collect all the data and send it
      // in one shot once the process exits.
      helper.stdout.on('data', data => {
        this.data += data.toString();
      });

      helper.on('close', () => {
        this.send(true);
        if (this.respawnDelaySecs) {
          this.respawnTimer = setTimeout( () => {
            this._launch();
            this.respawnTimer = null;
          }, this.respawnDelaySecs * 1000);
        }
      });
    }

    this.helper = helper;
  }

  send(dumpTologcat = false) {
    if (this.data.length === 0) {
      return;
    }

    if (this.socket) {
      this.socket.emit('diag', {
        type: this.type,
        log: this.data
      });
    }

    if (dumpTologcat) {
      // Dump as well for convenience
      const lines = this.data.split('\n');
      log.info(`${this.cmd}:`);
      lines.forEach(l => log.verbose(l));
    }
  }

  config(cmd, params, respawnDelaySecs) {
    this.cmd = cmd;
    this.params = params;
    this.respawnDelaySecs = respawnDelaySecs;
    this._launch();
    return this;
  }

  deinit() {
    this.socket = null;
    if (this.helper) {
      this.helper.removeAllListeners('close'); // to not respawn on close event
      this.helper.kill();
      this.helper = null;
    }
    if (this.respawnTimer) {
      clearTimeout(this.respawnTimer);
      this.respawnTimer = null;
    }
  }
}

export default class Diag {
  constructor() {
    this.socket = null;
    this.cfg = [];

    this.loggers = [
      new DiagLogger('logcat',
        '/system/bin/logcat',
        /* "-T 0" to skip to the current tip of logcat data. Diag starts up
           immediately at boot before the device connects to the server so any
           existing scroll back will be lost anyway (as there's no socket yet) */
        ['-v', 'threadtime', '-T', '0']),

      new DiagLogger('dash',
        '/system/silk/bin/dash', [], 60),
    ];
  }

  start(socket) {
    log.info('Starting diag service');
    this.socket = socket;
    this._applyConfig();
  }

  stop() {
    log.info('Stopping diag service');
    this.loggers.map( logger => logger.socket = null );
    this.socket = null;
  }

  setConfig(cfg) {
    if (JSON.stringify(cfg) === JSON.stringify(this.cfg)) {
      // No config change, nothing do to.
      return;
    }
    log.info(`config: ${JSON.stringify(cfg)}`);
    this.cfg = cfg;
    this._applyConfig();
  }

  _applyConfig() {
    this.loggers.map(logger => {
      let type = logger.type;
      if (type in this.cfg) {
        if (this.cfg[type] === 1) {
          log.info('Enabling', type);
          logger.socket = this.socket;
          logger.send(); // Send the latest data immediately
        } else {
          log.info('Disabling', type);
          logger.socket = null;
        }
      }
    });
  }
}
