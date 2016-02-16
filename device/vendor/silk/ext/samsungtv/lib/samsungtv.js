/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

// Load the regnerator polyfill manually so we don't need to also load all the
// core-js pollyfills which we don't actually need...
import regeneratorRuntime from 'babel-runtime/regenerator';
global.regeneratorRuntime = global.regeneratorRuntime || regeneratorRuntime;

let log;

class MicStreamer {
  micEnabled = false;

  constructor(env) {
    log = env.log;

    this.camera = env.camera;
    this.server = env.server;
    this.server.on('disconnect', () => {
      this.camera.removeListener('mic-data', this.onMicData);
    });
  }

  onCommand(cmd) {
    if ('livestream' !== cmd.msg) {
      return;
    }
    let enableMicStream = !!cmd.mic;
    log.info(`Got livestream request with cmd.mic=${cmd.mic}`);
    if (enableMicStream === this.micEnabled) {
      return;
    }
    this.micEnabled = enableMicStream;
    if (this.micEnabled) {
      log.info('Enabling mic stream');
      this.camera.on('mic-data', this.onMicData);
    } else {
      log.info('Disabling mic stream');
      this.camera.removeListener('mic-data', this.onMicData);
    }
  }

  onMicData = (msg) => {
    this.server.send('mic', {
      when: msg.when,
      // TODO: don't hard-code these
      numChannels: 1,
      bytesPerSample: 2,
      sampleRate: 8000,
      samples: msg.frames,
    });
  };
}

module.exports = (env) => new MicStreamer(env);
