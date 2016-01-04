/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

/**
 * This module exposes various bits of the v8 profiler over an http interface
 * which can be used via our CLI tools (and in the future even remotely).
 */

import http from 'http';
import eventToPromise from 'event-to-promise';
import createLog from '../log';
import path from 'path';
import fs from 'mz/fs';
import { getboolprop } from '../sysutils';

const PROF_ENABLED_PROP = 'persist.silk.profiling.enabled';
const PROF_ENABLED = getboolprop(PROF_ENABLED_PROP);
const PORT = 60024;

const log = createLog('profiler');

let _lazyV8Prof;
function v8Profiler() {
  if (!_lazyV8Prof) {
    _lazyV8Prof = require('v8-profiler');
  }
  return _lazyV8Prof;
}

async function readJSON(stream) {
  let buffer = '';
  stream.on('data', (data) => buffer += data);
  await eventToPromise(stream, 'end');
  return JSON.parse(buffer);
}

function sendJSON(res, code, body, headers = {}) {
  let content = JSON.stringify(body);
  let size = Buffer.byteLength(content);

  res.writeHeader(code, Object.assign({}, headers, {
    'Content-Type': 'application/json',
    'Content-Length': size
  }));
  res.end(content);
}

class ProfileServer {

  // current cpu profile
  cpuProfile = false

  /**
   * Start the v8 cpu sampling profiler...
   */
  async startCPU(req, res) {
    if (this.cpuProfile) {
      sendJSON(res, 400, {
        error: 'CPU Profile already in progress'
      });
      return;
    }

    this.cpuProfile = true;
    let name = `silk_${Date.now()}`;
    let profiler = v8Profiler();
    process.nextTick(() => {
      profiler.startProfiling('1', true);
      sendJSON(res, 200, { name });
    });
  }

  /**
   * Collect the currently running profile.
   */
  async collectCPU(req, res) {
    if (!this.cpuProfile) {
      sendJSON(res, 400, {
        error: 'CPU Profile not in progress'
      });
      return;
    }


    log.info(`collect cpu`, this.cpuProfile);
    let profiler = v8Profiler();
    process.nextTick(() => {
      let result = profiler.stopProfiling('1', true);
      profiler.deleteAllProfiles();
      res.writeHeader(200, {
        'Content-Type': 'application/json'
      });
      result.export(res);
      this.cpuProfile = false;
    });
  }

  /**
   * Load a sourcemap off the device. This is intended to be used in conjunction
   * with the output of the v8 profiler (which reads our massive browserified
   * files). The idea is you collect a cpu/heap profile then grab the sourcemap
   * and resolve lines on the _host_ rather then the _device_ which is
   * expensive.
   *
   * XXX: In the future we may store our sourcemaps somewhere remotely.
   */
  async sourcemap(req, res) {
    let json = await readJSON(req);
    log.info(json, req.headers);
    let filePath = path.normalize(json.path);
    log.info(`Attempting to load sourcemap ${filePath}`);

    if (path.extname(filePath) !== '.map') {
      sendJSON(res, 400, {
        error: '.path must end in .map suffix'
      });
      return;
    }

    if (filePath.indexOf('/system/silk') !== 0) {
      sendJSON(res, 400, {
        error: 'Path must start with /system/silk'
      });
      return;
    }

    if (!await fs.exists(filePath)) {
      log.info(`${filePath} does not exist!`);
      sendJSON(res, 400, { error: 'Missing file ' + filePath });
      return;
    }

    res.writeHead(200, {
      'Content-Type': 'application/json'
    });

    fs.createReadStream(filePath).pipe(res);
  }

  handle = async (req, res) => {
    let url = req.url;
    log.info(`got request ${req.method} ${url}`);

    try {
      switch (url) {
      case '/start/cpu':
        await this.startCPU(req, res);
        break;
      case '/collect/cpu':
        await this.collectCPU(req, res);
        break;
      case '/sourcemap':
        await this.sourcemap(req, res);
        break;
      default:
        res.writeHeader(404);
        res.end();
        break;
      }
    } catch (err) {
      sendJSON(res, 500, { error: err.stack });
    }
  }

}

export default async function start() {
  if (!PROF_ENABLED) {
    log.info('Profiling is disabled...');
    return;
  }

  log.info('Profiling enabled!');
  let profiler = new ProfileServer();
  http.createServer(profiler.handle).listen(PORT);
}

