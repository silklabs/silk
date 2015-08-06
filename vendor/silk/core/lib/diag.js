/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

let log = require('./log')('diag');

class DiagLogger {
  // respawnDelay specifies amount of time to wait after process
  // dies before running the command again. Use null for one-shot.
  constructor(id, type, cmd, params, respawnDelaySecs) {
    this.id = id;
    this.type = type;
    this.respawnTimer = null;
    this.helper = null;
    this.socket = null;
    this.config(cmd, params, respawnDelaySecs);
  }

  _launch() {
    log.info('Spawning', this.cmd);
    let spawn = require('child_process').spawn;
    let helper = spawn(this.cmd, this.params);

    helper.stdout.on('data', data => {
      if (this.socket) {
        this.socket.emit('log', {
          id: this.id,
          type: this.type,
          log: data.toString()
        });
      }
    });

    helper.on('close', () => {
      if (this.respawnDelaySecs !== null) {
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

    this.loggers = [
      new DiagLogger(this.id, 'logcat',
        '/system/bin/logcat', ['-v', 'threadtime'], 0),

      new DiagLogger(this.id, 'procrank',
        '/system/xbin/procrank', [], 10)
    ];
  }

  start(socket) {
    log.info('Starting diag service');
    this.socket = socket;
  }

  stop() {
    log.info('Stopping diag service');
    this.loggers.map( logger => logger.stop() );
    this.socket = null;
  }

  setConfig(cfg) {
    this.loggers.map( logger => {
      let type = logger.type;
      if (type in cfg) {
        if (cfg[type] === 1) {
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
