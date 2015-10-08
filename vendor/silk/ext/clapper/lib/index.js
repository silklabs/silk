/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */
/**
 * Copyright (c) 2015 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

let log;

const CLAPPER_PLAY_SOUND_PROP = 'persist.silk.clapper.sound';
const TWO_CLAPS_FILENAME = 'two_claps_detected.mp3';

class Clapper {
  constructor(env) {
    this._env = env;
    log = env.log;

    this._initClapDetector();
    this._initLoudSoundDetector();

    this._onMicData = pkt => {
      this._clapDetector.processPcmFrames(pkt.when, pkt.frames);
      //this._loudSoundDetector.processPcmFrames(pkt.when, pkt.frames);
    };

    this._env.camera.on('mic-data', this._onMicData);
    log.info('clapper loaded \\o\/');
  }

  _initClapDetector() {
    let ClapDetector = require('./clapDetector')(this._env);
    this._clapDetector = new ClapDetector();

    this._onClap = clap => {
      let count = clap.count;
      let type = clap.type;

      log.info(`clap ${clap.type} ${clap.count}`);

      let hueLightsOn = false;
      let soundEnabled = this._env.util.getboolprop(CLAPPER_PLAY_SOUND_PROP);
      let tag = count === 1 ? 'clap ' : `${count} claps`;

      if (count == 2 && type === 'normal') {
        this._env.log.info(tag);
        if (soundEnabled) {
          this._env.util.playSound(TWO_CLAPS_FILENAME);
        }
        this._env.timeline.addObject(tag);
      }
      if (count === 2 && type === 'normal') {
        hueLightsOn = !hueLightsOn;
        this._env.hue.setState( { on: hueLightsOn, intensity: 1.0 } );
      }
    };
    this._clapDetector.on('clap', this._onClap);
  }

  _initLoudSoundDetector() {
    let cfg = {
      // TODO: hard coded constants assumed
      sampleRate: 8000,
      bytesPerSample: 2,
      numChannels: 1,
      fftWindowSize: 256, // 32ms - units of samples
      fftWindowStep: 16,  // 2ms - units of samples 
      riseDurationMs: 8,
      riseEnergyDelta: 50000,
      minEnergyThreshold: 100000,
      minEnergyDurationMs: 100,
      maxEnergyDurationMs: 1000,
      //saveWavFilename: '/data/media/micInputDebug.wav',
      //saveWavDurationSecs: 10,
    };

    let LoudSoundDetector = require('./loudSoundDetector')(this._env);
    this._loudSoundDetector = new LoudSoundDetector(cfg);

    this._onLoudSound = () => {
      log.info('loud sound detected');
      this._env.timeline.addObject('loud-sound');
    };
    this._loudSoundDetector.on('loudSound', this._onLoudSound);
  }

  willUnload() {
    this._env.camera.removeListener('mic-data', this._onMicData);
    this._clapDetector.removeListener('clap', this._onClap);
    this._clapDetector.cleanup();
    //this._loudSoundDetector.removeListener('loudSound', this._onLoudSound);
    //this._loudSoundDetector.cleanup();
  }
}

module.exports = env => new Clapper(env);

