/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

// Load the regnerator polyfill manually so we don't need to also load all the
// core-js pollyfills which we don't actually need...
import regeneratorRuntime from 'babel-runtime/regenerator';
global.regeneratorRuntime = regeneratorRuntime;

let log;
let util;

// Adjust clap and loud sound detection sensititivty. Will need to make
// this more user friendly and make this a single setting, but for now,
// this value determines the minimum duration (in ms) the sound must
// maintain a certain energy level to be considered a clap or a loud sound.
//
// Defaults for loud sound: 140
// Defaults for clap: 70
//
const CLAPPER_LOUDSOUND_ADJUST_PROP = 'persist.silk.loudsound.adjust';
const CLAPPER_CLAP_ADJUST_PROP = 'persist.silk.clap.adjust';

const CLAPPER_PLAY_SOUND_PROP = 'persist.silk.clapper.sound';
const TWO_CLAPS_FILENAME = 'two_claps_detected.mp3';

const RISE_ENERGY_DELTA_PROP = 'ro.silk.clapper.rise.delta';
const MIN_ENERGY_THRESH_PROP = 'ro.silk.clapper.min.thresh';

class Clapper {
  constructor(env) {
    this._env = env;
    log = env.log;
    util = env.util;

    // Platform specific constants
    this._riseEnergyDelta = util.getintprop(RISE_ENERGY_DELTA_PROP, 25000);
    this._minEnergyThreshold = util.getintprop(MIN_ENERGY_THRESH_PROP, 30000);

    log.info(`Clapper init with riseEnergyDelta: ${this._riseEnergyDelta} ` +
        `and minEnergyThreshold: ${this._minEnergyThreshold}`);

    let fftCfg = {
      // TODO: hard coded audio constants assumed.  Changing these will also
      //       affect AudioSourceEmitter.cpp
      sampleRate: 8000,
      bytesPerSample: 2,
      numChannels: 1,
      fftWindowSize: 256, // 32ms - units of samples
      fftWindowStep: 64,  // 8ms - units of samples
    };

    let audioTools = require('./audioTools')(env);
    this._fftProcessor = new audioTools.FftProcessor(fftCfg);

    this._initClapDetector();
    this._initLoudSoundDetector();

    this._onMicData = pkt => {
      this._fftProcessor.processSamples(pkt.when, pkt.frames);
    };

    this._env.camera.on('mic-data', this._onMicData);
    log.info('clapper loaded \\o\/');
  }

  _initClapDetector() {
    let minEnergyDurationMs =
      util.getintprop(CLAPPER_CLAP_ADJUST_PROP, 70);

    // Assume that if the min value needs to be larger, that the device is
    // in an environment that has more echo, thus the max needs to be
    // proportionally larger too.
    let maxEnergyDurationMs = minEnergyDurationMs * 6;

    log.info(`Init clap detector with min energy duration: ` +
        `${minEnergyDurationMs} ms and max energy duration: ` +
        `${maxEnergyDurationMs} ms`);

    let cfg = {
      fftProcessor: this._fftProcessor,
      riseDurationMs: 24,
      riseEnergyDelta: 10000,
      minEnergyThreshold: 15000,
      minEnergyDurationMs: minEnergyDurationMs,
      maxEnergyDurationMs: maxEnergyDurationMs,
    };

    let ClapDetector = require('./clapDetector')(this._env);
    this._clapDetector = new ClapDetector(cfg);

    this._onClap = clap => {
      let count = clap.count;
      let type = clap.type;

      log.info(`clap ${clap.type} ${clap.count}`);

      let lightsOn = false;
      let soundEnabled = util.getboolprop(CLAPPER_PLAY_SOUND_PROP);
      let tag = count === 1 ? 'clap ' : `${count} claps`;

      if (count === 2 && type === 'normal') {
        this._env.log.info(tag);
        if (soundEnabled) {
          util.playSound(TWO_CLAPS_FILENAME);
        }
        this._env.timeline.addObject(tag);
      }
      if (count === 2 && type === 'normal') {
        lightsOn = !lightsOn;
        log.info('light is', lightsOn ? 'on' : 'off');
      }
    };
    this._clapDetector.on('clap', this._onClap);
  }

  _initLoudSoundDetector() {
    let minEnergyDurationMs =
      util.getintprop(CLAPPER_LOUDSOUND_ADJUST_PROP, 140);

    log.info(`Init loud sound with min energy ` +
        `duration: ${minEnergyDurationMs}ms`);

    let cfg = {
      fftProcessor: this._fftProcessor,
      riseDurationMs: 24,
      riseEnergyDelta: this._riseEnergyDelta,
      minEnergyThreshold: this._minEnergyThreshold,
      minEnergyDurationMs: minEnergyDurationMs,
      maxEnergyDurationMs: 5000,
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
    this._loudSoundDetector.removeListener('loudSound', this._onLoudSound);
    this._loudSoundDetector.cleanup();
    this._fftProcessor.cleanup();
  }
}

module.exports = env => new Clapper(env);
