#!/usr/bin/env ../../../../pub/babel-run/babel-node

/**
 * Copyright (c) 2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @private
 * @noflow
 */

import KeywordSpotting from '..';
import config from 'silk-config';
import { default as createLog, configureLog } from 'silk-log';
import mic from 'mic';
import { configureSpeechToText } from 'silk-stt';
import * as speechOptions from 'silk-dialog-script/lib/speechAccessToken';
configureSpeechToText(speechOptions);

configureLog('*');
const log = createLog('runAudioDnn');

// Create instance of keyword spotting module
let kws = new KeywordSpotting(null, true);

// Hook up mic-data
let simMic = mic({
  bitwidth: 8 * config.deviceMic.bytesPerSample,
  channels: config.deviceMic.numChannels,
  encoding: config.deviceMic.encoding,
  endian: config.deviceMic.endian,
  rate: config.deviceMic.sampleRate,
});
let micInput = simMic.getAudioStream();
micInput.on('data', (data) => {
  kws.addMicData({ when: Date.now(), frames: data });
});
micInput.on('error', (error) => {
  log.error(`Sim mic error: ${error}`);
  process.exit(1); // eslint-disable-line
});
simMic.start();

// Start keyword spotting
kws.on(`ready`, () => {
  kws.start();
});
