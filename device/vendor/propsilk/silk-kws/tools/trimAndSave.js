#!/usr/bin/env ../../../../pub/babel-run/babel-node

/**
 * Copyright (c) 2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @noflow
 */

'use strict';

import fs from 'fs';
import wavDecoder from 'wav-decoder';
import wavEncoder from 'wav-encoder';
import removeSilence from '../lib/remove-silence';
import { default as createLog, configureLog } from 'silk-log';
configureLog('*');

const log = createLog('keyword_test');

let fileName = process.argv[2];
let outFileName = `${fileName.slice(0, -4)}_trim.wav`;
log.debug(`filename: ${outFileName}`);

let data = fs.readFileSync(fileName);
wavDecoder.decode(data).then(rawData => {
  let audioData = removeSilence(rawData.channelData[0]);
  wavEncoder.encode({
    sampleRate: 16000,
    channelData: [audioData],
  }).then(buffer => {
    fs.writeFileSync(outFileName, new Buffer(buffer));
    log.debug(`done`);
  })
  .catch(err => log.error(err));
});
