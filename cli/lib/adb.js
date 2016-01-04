/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

import createLog from 'log';
import childProcess from 'child_process';
import tmp from 'tmp';
import fs from 'mz/fs';

const log = createLog('adb');

class Adb {
  constructor(device) {
    this.device = device;
    this._root = false;
  }

  async cmd(args = []) {
    let stdout = '';
    let stderr = '';
    if (this.device) {
      args = ['-s', this.device].concat(args);
    }

    log.debug(`cmd: adb ${args.join(' ')}`);
    return new Promise((resolve, reject) => {
      let helper = childProcess.spawn('adb', args);
      helper.stdout.on('data', chunk => stdout += chunk.toString());
      helper.stderr.on('data', chunk => stderr += chunk.toString());
      helper.on('close', code => {
        if (code !== 0) {
          reject(new Error(stderr));
          return;
        }
        resolve(stdout);
      });
    });
  }

  async listDevices() {
    let stdout = await this.cmd(['devices']);

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
    if (!this._root) {
      await this.cmd(['root']);
      await this.cmd(['wait-for-device']);
      this._root = true;
    }
  }

  async shell(args) {
    args = ['shell'].concat(args);
    return await this.cmd(args);
  }

  async getTmpFilename() {
    return new Promise((resolve, reject) => {
      tmp.tmpName((err, path) => {
        if (err) {
          reject(new Error(err));
          return;
        }
        resolve(path);
      });
    });
  }

  async push(filepath, data) {
    await this.root();

    let tmpFilename = await this.getTmpFilename();
    await fs.writeFile(tmpFilename, data);
    await this.cmd(['push', tmpFilename, filepath]);
    await fs.unlink(tmpFilename);
    return;
  }

  async pull(filepath) {
    await this.root();

    let tmpFilename = await this.getTmpFilename();
    await this.cmd(['pull', filepath, tmpFilename]);
    let data = await fs.readFile(tmpFilename);
    await fs.unlink(tmpFilename);
    return data;
  }
}

export default function createAdb(device) {
  return new Adb(device);
}

