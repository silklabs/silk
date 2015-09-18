/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */
/**
 * Copyright (c) 2015 Silk Laboratories, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Laboratories, Inc.
 */

let log = require('./log')('diag');

class DiagLogger {
  // respawnDelay specifies amount of time to wait after process dies before
  // running the command again. Use null for "streaming logs" that should be
  // running at all times.
  constructor(id, type, cmd, params, respawnDelaySecs) {
    this.id = id;
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
            id: this.id,
            type: this.type,
            log: data.toString()
          });
        }
      });
    } else {
      // For a non-streaming log (eg, procrank) collect all the data and send it
      // in one shot once the process exits.
      helper.stdout.on('data', data => {
        this.data += data.toString();
      });
    }

    helper.on('close', () => {
      if (this.data.length > 0) {
        if (this.socket) {
          this.socket.emit('diag', {
            id: this.id,
            type: this.type,
            log: this.data
          });
        }
        this.data = '';
      }
      if (this.respawnDelaySecs) {
        this.respawnTimer = setTimeout( () => {
          this._launch();
          this.respawnTimer = null;
        }, this.respawnDelaySecs * 1000);
      }
    });

    this.helper = helper;
  }

  config(cmd, params, respawnDelaySecs) {
    this.cmd = cmd;
    this.params = params;
    this.respawnDelaySecs = respawnDelaySecs;
    return this;
  }

  start(socket) {
    this.stop();
    this.socket = socket;
    this._launch();
  }

  stop() {
    if (this.helper) {
      this.helper.removeAllListeners('close'); // to not respawn on close event
      this.helper.kill();
      this.helper = null;
    }
    if (this.respawnTimer) {
      clearTimeout(this.respawnTimer);
      this.respawnTimer = null;
    }
    this.socket = null;
  }
}

class Diag {
  constructor(id) {
    this.id = id;
    this.socket = null;
    this.cfg = [];

    this.loggers = [
      new DiagLogger(this.id, 'logcat',
        '/system/bin/logcat', ['-v', 'threadtime']),

      new DiagLogger(this.id, 'procrank',
        '/system/xbin/procrank', [], 10),

      new DiagLogger(this.id, 'dash',
        '/system/silk/bin/dash', [], 10),
    ];
  }

  start(socket) {
    log.info('Starting diag service');
    this.socket = socket;
    this._applyConfig();
  }

  stop() {
    log.info('Stopping diag service');
    this.loggers.map( logger => logger.stop() );
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
          logger.start(this.socket);
        } else {
          log.info('Disabling', type);
          logger.stop(this.socket);
        }
      }
    });
  }
}

module.exports = (id) => new Diag(id);
