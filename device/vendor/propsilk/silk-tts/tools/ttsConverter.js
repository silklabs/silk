#!/usr/bin/env ../../../../pub/babel-run/babel-node

/**
 * Copyright (c) 2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @private
 */

import tts from 'silk-tts';
import config from 'silk-config';
import wav from 'wav';
import { default as createLog, configureLog } from 'silk-log';
import * as speechOptions from 'silk-dialog-script/lib/speechAccessToken';

configureLog('*');
const log = createLog('ttsConverter');

let pcmSamples = new Buffer(0);

if (process.argv.length < 4) {
  log.error(`Usage:
    text     : Text to convert to speech
    fileName : Name of the file in which to write the speech output`);
  process.exit(1); // eslint-disable-line
}

/**
 * Write pcm data to file
 */
function writeWavFile(pcmSamples, fileName) {
  let writer = new wav.FileWriter(fileName, {
    sampleRate: config.deviceMic.sampleRate,
    channels: config.deviceMic.numChannels,
    bitDepth: config.deviceMic.bytesPerSample * 8,
  });
  writer.on('header', () => {
    log.info('Done');
    setTimeout(() => process.exit(1), 1000); // eslint-disable-line
  });
  writer.on('error', err => {
    log.error(err);
  });
  writer.write(pcmSamples);
  writer.end();
}

// Convert text to raw pcm data
log.info(`Converting \'${process.argv[2]}\' to speech`);
tts.configure(speechOptions);
tts.startRequest(process.argv[2]);
tts.addListener(`error`, (error) => {
  log.info(`TTS error`, error);
});
tts.addListener(`data`, (data) => {
  pcmSamples = Buffer.concat([pcmSamples, data]);
});
tts.addListener(`end`, () => {
  writeWavFile(pcmSamples, process.argv[3]);
});
