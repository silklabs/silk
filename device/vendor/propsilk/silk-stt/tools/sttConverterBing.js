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
const log = createLog('sttConverterBing');

configureSpeechToText(speechOptions);

export default function main(fileName) {
  // Convert pcm data to text
  return new Promise((resolve, reject) => {
    log.info(`Converting \'${fileName}\' to text`);
    let stt = new SpeechToText();
    stt.startRequest((error, text) => {
      if (error) {
        return reject(error);
      } else {
        return resolve(text);
      }
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
    fs.createReadStream(fileName).pipe(reader).resume();
  });
}
