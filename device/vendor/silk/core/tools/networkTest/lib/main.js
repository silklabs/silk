/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

import createLog from './log';
import * as util from './sysutils';
import ServerTester from './serverTester';
import network from './network';
import config from './args';
import url from 'url';
import Table from 'easy-table';
import api from './api';
import { default as createApi, AccessToken } from 'silk-api';

const log = createLog('main');

let serverHost = url.parse(config.api.serverUrl).hostname;
let iterationCnt = config.tests.iterationCnt;

// max duration to run all tests (seconds) before considering a failure.
// 0 for no limit.
let maxDuration = config.tests.maxDuration;

/**
 * Specify which tests to run
 */
let networkTests = {};
if (config.tests.traceroute) {
  networkTests.traceroute = 1;
}

let serverTests = {};

serverTests.connect = { cnt: iterationCnt, hz: 4 };
serverTests.info = { cnt: iterationCnt, hz: 4 };
serverTests.preview = { cnt: iterationCnt, hz: 4 };
serverTests.video = { cnt: iterationCnt, hz: 1 };
serverTests.uploadVideo = { cnt: iterationCnt, hz: 1 };
serverTests.uploadBlob = { cnt: iterationCnt, hz: 1 };
serverTests.uploadMetadata = { cnt: iterationCnt, hz: 1 };


/**
 * Helpers for collecting stats
 */
let statsList = [];

function addStats(test, stat) {
  statsList.push({test, stat});
  printStats(test, stat);
}

function printStats(test, stat) {
  log.info(`${test} test avg: ${stat.avg}ms, ` +
      `min: ${stat.min}ms, max: ${stat.max}ms, cnt: ${stat.cnt}`);
}

function printSummary() {
  let table = new Table();
  statsList.forEach(stats => {
    table.cell('test', stats.test);
    table.cell('cnt', stats.stat.cnt);
    table.cell('avg', stats.stat.avg);
    table.cell('min', stats.stat.min);
    table.cell('max', stats.stat.max);
    table.newRow();
  });

  console.log(); // eslint-disable-line no-console
  console.log('Results (in ms):'); // eslint-disable-line no-console
  console.log(); // eslint-disable-line no-console
  console.log(table.toString()); // eslint-disable-line no-console
}

/**
 * Test runners
 */
function runNetworkTests() {
  if (networkTests.traceroute) {
    return network.traceroute(serverHost)
    .catch(util.processthrow);
  } else {
    return Promise.resolve();
  }
}

function runServerTests(accessToken) {
  let serverTester = new ServerTester(accessToken);
  let testChain = Promise.resolve();

  Object.keys(serverTests).forEach((test) => {
    let cfg = serverTests[test];
    testChain = testChain
      .then(() => serverTester.doTest(test, cfg.cnt, cfg.hz, cfg))
      .then(stat => addStats(test, stat))
      .catch(util.processthrow);
  });

  testChain = testChain
  .then(() => printSummary())
  .catch(util.processthrow);

  return testChain;
}


// Don't let tests run for too long (if specified, e.g. non-zero)
if (maxDuration) {
  setTimeout(() => {
    log.warn('test execution timed out :( Exiting');
    process.exit(-1); // eslint-disable-line no-process-exit
  }, maxDuration * 1000);
}

async function setupDevice() {
  api.accessToken = api.id.create();

  let accessToken = new AccessToken(
    api.devAccount.publicKey,
    api.devAccount.privateKey,
  );

  // API as the developer account...
  let accountApi = createApi();
  accountApi.accessToken = accessToken;

  // register the device...
  let token = accountApi.accessToken.sign(api.accessToken.toString());
  await accountApi.account.registerDevice({
    devicePublicKey: api.accessToken.toString(),
    name: 'testing',
    type: 'camera',
    registrationToken: token
  });

  await api.device.completeRegistration({
    registrarPublicKey: accountApi.accessToken.toString(),
    registrationToken: token
  });

  return api.accessToken;
}

async function main() {
  let accessToken = await setupDevice();
  await runNetworkTests();
  await runServerTests(accessToken);
  process.exit(0); // eslint-disable-line no-process-exit
}

main().catch(util.processthrow);
