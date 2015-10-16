/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */
/**
 * Copyright (c) 2015 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */
import createLog from './log';
import program from 'commander';
const log = createLog('args');

// TODO: modify silk api to export server urls
let config = {
  api: {
    serverUrl: 'https://silk-server-master.herokuapp.com',
  },
  tests: {
    traceroute: false,
    iterationCnt: 10,
    maxDuration: 0,
  }
};

program
  .option('-s, --serverUrl <url>', 'specify Silk Server Url')
  .option('-t, --traceroute', 'include traceroute in run')
  .option('-c, --iterationCnt <num>',
      'iteration count per test (default: 10)', parseInt)
  .option('-m, --maxDuration <seconds>',
      'max duration to run all tests. 0 is forever (default: 0)', parseInt)
  .parse(process.argv);

if (program.serverUrl) config.api.serverUrl = program.serverUrl;
if (program.traceroute) config.tests.traceroute = true;
if (program.iterationCnt !== undefined) {
  config.tests.iterationCnt = program.iterationCnt;
}
if (program.maxDuration !== undefined) {
  config.tests.maxDuration = program.maxDuration;
}

log.info(`Using Silk server: ${config.api.serverUrl}`);

export default config;
