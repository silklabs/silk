/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

import createLog from 'silk-log';
import childProcess from 'child_process';
import tmp from 'tmp';
import fs from 'mz/fs';
import { statSync } from 'fs';

const log = createLog('adb');

class Adb {
  constructor(device) {
    if (device === 'sim') { // TODO: Don't be so sneaky...
      [ 'data', 'system/silk' ].forEach((dir) => {
        // Ensure that the current working directory is the root of a simulated
        // device tree.
        let stats = null;
        try {
          stats = statSync(dir);
        } catch (err) {
          log.error(err);
        }
        if (!stats || !stats.isDirectory()) {
          throw new Error(`${dir} is not a directory`);
        }
      });
      this.sim = true;
    } else {
      this.device = device;
    }
    this._root = this.sim;
  }

  _spawn(cmd, args) {
    let stdout = '';
    let stderr = '';

    return new Promise((resolve, reject) => {
      let helper = childProcess.spawn(cmd, args);
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

  async cmd(args = []) {
    if (this.device) {
      args = ['-s', this.device].concat(args);
    }

    log.debug(`cmd: adb ${args.join(' ')}`);
    return this._spawn('adb', args);

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
    if (this.sim) {
      const cmd = args.shift();
      return await this._spawn(cmd, args);
    }

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
    if (this.sim) {
      await fs.writeFile(filepath, data);
      return;
    }

    await this.root();
    const tmpFilename = await this.getTmpFilename();
    await fs.writeFile(tmpFilename, data);
    await this.cmd(['push', tmpFilename, filepath]);
    await fs.unlink(tmpFilename);
  }

  async pull(filepath) {
    if (this.sim) {
      await fs.readFile(filepath, data);
      return data;
    }

    await this.root();
    const tmpFilename = await this.getTmpFilename();
    await this.cmd(['pull', filepath, tmpFilename]);
    let data = await fs.readFile(tmpFilename);
    await fs.unlink(tmpFilename);
    return data;
  }
}

export default function createAdb(device) {
  return new Adb(device);
}

