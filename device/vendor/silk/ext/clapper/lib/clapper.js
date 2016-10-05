/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @noflow
 */

import path from 'path';
import config from 'silk-config';
import * as util from 'silk-sysutils';
import player from 'silk-audioplayer';

let log;

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
const TWO_CLAPS_FILENAME = path.join(__dirname, '../media', 'two_claps_detected.mp3');

const RISE_ENERGY_DELTA_PROP = 'ro.silk.clapper.rise.delta';
const MIN_ENERGY_THRESH_PROP = 'ro.silk.clapper.min.thresh';

class Clapper {
  constructor(env) {
    this._env = env;
    log = env.log;

    // Platform specific constants
    this._riseEnergyDelta = util.getintprop(RISE_ENERGY_DELTA_PROP, 25000);
    this._minEnergyThreshold = util.getintprop(MIN_ENERGY_THRESH_PROP, 30000);

    log.info(`Clapper init with riseEnergyDelta: ${this._riseEnergyDelta} ` +
        `and minEnergyThreshold: ${this._minEnergyThreshold}`);

    let fftCfg = {
      sampleRate: config.deviceMic.sampleRate,
      bytesPerSample: config.deviceMic.bytesPerSample,
      numChannels: config.deviceMic.numChannels,
      fftWindowSize: 640, // 40ms - units of samples @ 16KHz
      fftWindowStep: 160, // 10ms - units of samples @ 16KHz
    };

    let audioTools = require('./audioTools')(env); // eslint-disable-line import/no-require
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

    let ClapDetector = require('./clapDetector')(this._env); // eslint-disable-line import/no-require
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
          player.play(TWO_CLAPS_FILENAME);
        }
        this._env.timeline.addObjects([{
          source: 'clapper',
          tag,
          persist: true,
          when: Date.now(),
          durationMs: 1000,
        }]);
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

    let LoudSoundDetector = require('./loudSoundDetector')(this._env); // eslint-disable-line import/no-require
    this._loudSoundDetector = new LoudSoundDetector(cfg);

    this._onLoudSound = () => {
      log.info('loud sound detected');
      this._env.timeline.addObjects([{
        source: 'clapper',
        tag: 'loud-sound',
        when: Date.now(),
        durationMs: 1000,
      }]);
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
