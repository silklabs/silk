/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @private
 */

import createLog from './log';
const log = createLog('diag');
import type Server from './server.js';


class DiagLogger {
  // respawnDelay specifies amount of time to wait after process dies before
  // running the command again. Use null for "streaming logs" that should be
  // running at all times.
  constructor(name, cmd, params, respawnDelaySecs) {
    this.name = name;
    this.respawnTimer = null;
    this.sendIntervalId = null;
    this.helper = null;
    this.server = null;
    this.data = '';
    this.config(cmd, params, respawnDelaySecs);
  }

  _launch() {
    log.info('Spawning', this.cmd);
    let spawn = require('child_process').spawn;
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

    if (this.server) {
      this.server.send('diag', {
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

  config(cmd, params, respawnDelaySecs) {
    this.cmd = cmd;
    this.params = params;
    this.respawnDelaySecs = respawnDelaySecs;
    this._launch();
    return this;
  }

  deinit() {
    this.server = null;
    if (this.helper) {
      this.helper.removeAllListeners('close'); // to not respawn on close event
      this.helper.kill();
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

export default class Diag {
  server: Server;

  constructor(server: Server) {
    this.server = server;
    this.cfg = [];

    this.loggers = [
      new DiagLogger('logcat',
        'system/bin/logcat',
        /* "-T 0" to skip to the current tip of logcat data. Diag starts up
           immediately at boot before the device connects to the server so any
           existing scroll back will be lost anyway */
        ['-v', 'threadtime', '-T', '0']),

      new DiagLogger('dash',
        'system/silk/bin/dash', [], 60),
    ];

    server.on('connect', () => {
      this.start();
    });

    server.on('disconnect', () => {
      this.stop();
    });
  }

  start() {
    log.info('Starting diag service');
    this._applyConfig();
  }

  stop() {
    log.info('Stopping diag service');
    this.loggers.map( logger => logger.server = null );
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
      let name = logger.name;
      if (name in this.cfg) {
        if (this.cfg[name] === 1) {
          log.info('Enabling', name);
          logger.server = this.server;
          logger.send(); // Send the latest data immediately
        } else {
          log.info('Disabling', name);
          logger.server = null;
        }
      }
    });
  }
}
