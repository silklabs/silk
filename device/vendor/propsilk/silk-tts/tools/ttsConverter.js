#!/usr/bin/env ../../../../pub/babel-run/babel-node

/**
 * Copyright (c) 2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @private
 * @flow
 */

import { default as TextToSpeech, configureTextToSpeech } from 'silk-tts';
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
function writeWavFile(pcmSamples: Buffer, fileName: string) {
  let writer = new wav.FileWriter(fileName, {
    sampleRate: config.deviceMic.sampleRate,
    channels: config.deviceMic.numChannels,
    bitDepth: config.deviceMic.bytesPerSample * 8,
  });
  writer.writeAll(pcmSamples)
  .then(() => process.exit(1)) // eslint-disable-line
  .catch(err => log.error(err));
}

// Convert text to raw pcm data
log.info(`Converting \'${process.argv[2]}\' to speech`);
configureTextToSpeech(speechOptions);
let tts = new TextToSpeech();
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
