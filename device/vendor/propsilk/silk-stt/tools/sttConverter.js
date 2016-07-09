#!/usr/bin/env ../../../../pub/babel-run/babel-node

/**
 * Copyright (c) 2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @private
 */

import { default as SpeechToText, configureSpeechToText } from 'silk-stt';
import wav from 'wav';
import fs from 'mz/fs';
import { default as createLog, configureLog } from 'silk-log';
import * as speechOptions from 'silk-dialog-script/lib/speechAccessToken';

configureLog('*');
const log = createLog('sttConverter');

if (process.argv.length < 3) {
  log.error(`Usage:
    fileName : Wav file to convert to text`);
  process.exit(1); // eslint-disable-line
}

configureSpeechToText(speechOptions);

// Convert pcm data to text
log.info(`Converting \'${process.argv[2]}\' to text`);
let stt = new SpeechToText();
stt.startRequest((error, text) => {
  if (error) {
    log.error(`Speech stream error`, error);
  } else {
    log.info(`Text: ${text}`);
  }
  process.exit(1); // eslint-disable-line
});

let reader = new wav.Reader();
reader.on('data', pcmData => {
  stt.write(pcmData);
});
reader.on('end', () => {
  stt.finish();
});
reader.on('error', err => {
  log.error(err);
});
fs.createReadStream(process.argv[2]).pipe(reader).resume();
