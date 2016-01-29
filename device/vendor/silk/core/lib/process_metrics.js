/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @private
 * @flow
 */

import api from './api';
import createLog from './log';
import {exec} from './sysutils';
import invariant from 'assert';
import * as Metrics from './metrics/process.js';

const log = createLog(`process-metrics`);

const DEFAULT_PROBE_INTERVAL_MS = 5 * 60 * 1000;
const MAIN_PROCESS_NAME = `silk-core`;

const PROCRANK_NUMBER_OF_PROCESSES_TO_REPORT = 5;
const PROCRANK_HEADER = `  PID       Vss      Rss      Pss      Uss  cmdline`;

const LSOF_HEADER =
  `COMMAND     PID       USER   FD      TYPE             DEVICE  ` +
  `SIZE/OFF       NODE NAME`;

const metrics = api.deviceMetrics;

function procrankStringToBytes(str: string): number {
  invariant(str.length > 1);

  let bytes = parseInt(str.slice(0, str.length - 1));

  switch (str[str.length - 1]) {
  case `K`:
    bytes *= 1024;
    break;

  default:
    throw new Error(`Can't convert string to bytes: '${str}'`);
  }

  return bytes;
}

async function launch(cmd: string, args: Array<any> = []): Promise<Array<string>> {
  log.debug(`Launching '${cmd}'`);
  let { code, stdout, stderr } = await exec(cmd, args);
  if (code) {
    throw new Error(`'${cmd}' failed with return code ${code}: ${stderr}`);
  }
  log.debug(`'${cmd}' finished successfully`);
  return stdout.split(`\n`);
}

async function procrank(): Promise<void> {
  const stdout = await launch(`procrank`);
  invariant(stdout[0] === PROCRANK_HEADER);

  for (let i = 1; i <= PROCRANK_NUMBER_OF_PROCESSES_TO_REPORT; i++) {
    let line = stdout[i];
    if (!line) {
      break;
    }

    let values = line.trim().split(/\s+/);
    if (values.length !== 6) {
      break;
    }

    let name = values[5].split(`/`).pop();

    metrics.add(new Metrics.MemoryVss(name, procrankStringToBytes(values[1])));
    metrics.add(new Metrics.MemoryRss(name, procrankStringToBytes(values[2])));
    metrics.add(new Metrics.MemoryPss(name, procrankStringToBytes(values[3])));
    metrics.add(new Metrics.MemoryUss(name, procrankStringToBytes(values[4])));
  }
}

async function lsof(): Promise<void> {
  const stdout = await launch(`lsof`, [process.pid]);
  invariant(stdout[0] === LSOF_HEADER);

  metrics.add(new Metrics.OpenFileDescriptors(`node`, stdout.length - 1));
}

async function probe(): Promise<any> {
  const asyncWork = Promise.all([
    procrank(),
    lsof(),
  ]);

  const usage = process.memoryUsage();
  metrics.add(new Metrics.MemoryHeap(MAIN_PROCESS_NAME,
                                     usage.rss,
                                     usage.heapTotal,
                                     usage.heapUsed));

  return asyncWork;
}

export default function startCollectingProcessMetrics(): void {
  log.info(`Waiting for ${DEFAULT_PROBE_INTERVAL_MS}ms before next probe`);

  setTimeout(async () => {
    log.info(`Probing`);

    let error;
    try {
      await probe();
    } catch(err) {
      error = err;
    }

    if (error) {
      log.warn(`Probe failed`, error);
    } else {
      log.info(`Probe finished`);
    }

    startCollectingProcessMetrics();
  }, DEFAULT_PROBE_INTERVAL_MS);
}
