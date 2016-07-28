#!/usr/bin/env ../../../../pub/babel-run/babel-node

/**
 * Copyright (c) 2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @private
 * @noflow
 */

import { default as createLog, configureLog } from 'silk-log';
import bing from './sttConverterBing';
import google from './sttConverterGoogle';
import fs from 'fs';
import path from 'path';

configureLog('*');
const log = createLog('sttConverter');
const KEYWORD = 'aristotle';
let totalCount = 0;
let keywordCount = 0;

function parseGoogleResult(result, file) {
  if (result.length && result[0].results && result[0].results.length &&
      (result[0].results[0].alternatives[0].transcript)) {
    return result[0].results[0].alternatives[0].transcript;
  } else {
    return '';
  }
}

function parseBingResult(result, file) {
  return result;
}

function countKeywords(result, file) {
  totalCount++;
  let text = parseResult(result, file);
  if (text.toLowerCase() === KEYWORD) {
    keywordCount++;
  }
  log.info(`Result: ${text}, ${keywordCount}/${totalCount}`);
}

if (process.argv.length < 3) {
  log.error(`Usage:
    fileName : Wav file to convert to text`);
  process.exit(1); // eslint-disable-line
}

let input = process.argv[2];
let parseResult = parseBingResult.bind();
let main = bing.bind();
if (process.argv.length >= 4) {
  if (process.argv[3].toLowerCase() === 'google') {
    parseResult = parseGoogleResult.bind();
    main = google.bind();
  }
}

if (fs.lstatSync(input).isDirectory()) {
  let files = fs.readdirSync(input);
  let speechPromise = Promise.resolve();
  files.forEach(file => {
    speechPromise = speechPromise.then(() => main(path.join(input, file)))
    .then(result => {
      log.debug(file);
      countKeywords(result, file);
    })
    .catch(err => log.error(err));
  });
  speechPromise.then(() => process.exit(0)); // eslint-disable-line
} else {
  main(input)
  .then(result => {
    countKeywords(result, input);
    process.exit(0); // eslint-disable-line
  })
  .catch(err => log.error(err));
}
