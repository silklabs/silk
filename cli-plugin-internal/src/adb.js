/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @flow
 */

import createLog from 'silk-log';
import * as childProcess from 'child_process';
import fs from 'mz/fs';
import { statSync } from 'fs';
import mkdirp from 'mkdirp-promise';
import path from 'path';
import tmp from 'tmp';

const log = createLog('adb');

class Adb {
  device: ?string;
  sim: boolean = false;
  _root: boolean;

  constructor(device: ?string) {
    this.device = device;

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
    }

    this._root = this.sim;
  }

  _spawn(cmd: string, args: Array<string>): Promise<string> {
    let stdout = '';
    let stderr = '';
    log.debug(`_spawn: ${cmd} ${args.join(' ')}`);

    return new Promise((resolve, reject) => {
      let helper = childProcess.spawn(cmd, args);
      helper.stdout.on('data', (chunk) => {
        stdout += chunk.toString();
      });
      helper.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });
      helper.on('close', code => {
        if (code !== 0) {
          log.debug(`_spawn: err=${code}, stderr=${stderr}`);
          reject(new Error(stderr));
          return;
        }
        log.debug(`_spawn: err=0, stdout=${stdout}`);
        resolve(stdout);
      });
    });
  }

  async cmd(args: Array<string> = []): Promise<string> {
    if (this.device) {
      args = ['-s', this.device].concat(args);
    }

    return this._spawn('adb', args);
  }

  async listDevices(): Promise<Array<string>> {
    let stdout = await this.cmd(['devices']);

    let devices = [];
    let lines = stdout.replace('\r', '', 'g').split('\n');
    lines.shift();

    lines.forEach(line => {
      let match = line.match(/^([0-9a-fA-F]+)/);
      if (match) {
        devices.push(match[1]);
      }
    });

    return devices;
  }

  async root(): Promise<void> {
    if (!this._root) {
      await this.cmd(['root']);
      await this.cmd(['wait-for-device']);
      this._root = true;
    }
  }

  async shell(args: Array<string>): Promise<string> {
    if (this.sim) {
      const cmd = args.shift();
      return await this._spawn(cmd, args);
    }

    args = ['shell'].concat(args);
    return await this.cmd(args);
  }

  async getTmpFilename(): Promise<string> {
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

  async push(filepath: string, data: Buffer | string): Promise<void> {
    if (this.sim) {
      await mkdirp(path.dirname(filepath));
      await fs.writeFile(filepath, data);
      return;
    }

    await this.root();
    const tmpFilename = await this.getTmpFilename();
    await fs.writeFile(tmpFilename, data);
    await this.cmd(['push', tmpFilename, filepath]);
    await fs.unlink(tmpFilename);
  }

  async pull(filepath: string): Promise<Buffer> {
    if (this.sim) {
      return await fs.readFile(filepath);
    }

    await this.root();
    const tmpFilename = await this.getTmpFilename();
    await this.cmd(['pull', filepath, tmpFilename]);
    let data = await fs.readFile(tmpFilename);
    await fs.unlink(tmpFilename);
    return data;
  }
}

export type {Adb};

export default function createAdb(device: ?string): Adb {
  return new Adb(device);
}
