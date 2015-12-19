/**
 * Copyright (c) 2015 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

/* eslint-disable no-console */

import createLog from 'log';
import childProcess from 'child_process';
import tmp from 'tmp';
import fs from 'mz/fs';

const log = createLog('adb');

class Adb {
  constructor(device) {
    this.device = device;
  }

  async cmd(args = []) {
    let stdout = '';
    let stderr = '';
    if (this.device) {
      args.unshift(this.device);
      args.unshift('-s');
    }

    log.debug(`cmd: adb ${args.join(' ')}`);

    return new Promise(resolve => {
      let helper = childProcess.spawn('adb', args);
      helper.stdout.on('data', chunk => stdout += chunk.toString());
      helper.stderr.on('data', chunk => stderr += chunk.toString());
      helper.on('close', () => resolve({stdout, stderr}));
    });
  }

  async listDevices() {
    let {stdout} = await this.cmd(['devices']);

    let devices = [];
    let lines = stdout.replace('\r').split('\n');
    lines.shift();

    lines.forEach(line => {
      let match = line.match(/^([0-9a-fA-F]+)/);
      if (match) {
        devices.push(match[1]);
      }
    });

    return devices;
  }

  async root() {
    await this.cmd(['root']);
    await this.cmd(['wait-for-device']);
  }

  async shell(args) {
    args.unshift('shell');
    return await this.cmd(args);
  }

  async getTmpFilename() {
    return new Promise(resolve => {
      tmp.tmpName((err, path) => {
        if (err) throw err;
        resolve(path);
      });
    });
  }

  async push(filepath, data) {
    await this.root();

    let tmpFilename = await this.getTmpFilename();
    await fs.writeFile(tmpFilename, data);
    let {stderr} = await this.cmd(['push', tmpFilename, filepath]);
    if (stderr.match(/^error/)) {
      console.error(stderr);
      throw stderr;
    }
    await fs.unlink(tmpFilename);
    return;
  }

  async pull(filepath) {
    await this.root();

    let tmpFilename = await this.getTmpFilename();
    let {stderr} = await this.cmd(['pull', filepath, tmpFilename]);
    if (stderr.match(/^error/)) {
      console.error(stderr);
      throw stderr;
    }
    let data = await fs.readFile(tmpFilename);
    await fs.unlink(tmpFilename);
    return data;
  }
}

export default function createAdb(device) {
  return new Adb(device);
}

