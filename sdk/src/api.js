/**
 * API used by the cli to push and manage files.
 *
 * @flow
 */

import path from 'path';

import { exec } from 'mz/child_process';
import { spawn } from 'child_process';
import which from 'which';

const SILK_MODULE_ROOT = '/system/silk/node_modules';
const ACTIVATE_PROP = 'persist.silk.main';

async function execWithPaths(
  cmd,
  additionalPaths,
  timeout = 10000,
) {
  const env = process.env;
  const PATH = env.PATH.split(':');
  const newPath = additionalPaths.concat(PATH).join(':');

  const cmdEnv = {};
  for (let key in env) {
    cmdEnv[key] = env[key];
  }
  cmdEnv.PATH = newPath;

  try {
    return await exec(cmd, {
      env: cmdEnv,
      timeout
    });
  } catch (err) {
    throw new Error(`An error occured while running: ${cmd} ${err.stack}`);
  }
}

export default class API {
  device = null;
  additionalPaths = [];
  _adbPath = null;

  constructor(opts) {
    for (let key in opts) {
      this[key] = opts[key];
    }
  }

  async adb(adbCmd) {
    let cmd = `adb`;
    if (this.device) {
      cmd += ` -s ${this.device}`;
    }
    return execWithPaths(`${cmd} ${adbCmd}`, this.additionalPaths);
  }

  async restart() {
    await this.adb(`shell stop`);
    await this.adb(`shell start`);
  }

  async activate(name) {
    this.setprop(ACTIVATE_PROP, name);
  }

  logcat(logcatArgs) {
    if (!this._adbPath) {
      this._adbPath = which.sync('adb');
    }

    const args = [];
    if (this.device) {
      args.push('-s', this.device);
    }
    args.push('logcat');
    args.push(...logcatArgs);

    return spawn(this._adbPath, args, {
      // XXX: May be better to use inherit.
      stdio: 'pipe'
    });
  }

  async pushModule(name, directory) {
    // XXX: Right now we let you push wherever.
    const dest = path.join(SILK_MODULE_ROOT, name);

    await this.adb('remount');

    // XXX: This potentially makes things slower but ensures we don't leave
    // around files between pushes which is a common source of bugs.
    await this.adb(`shell rm -rf ${dest}`);
    await this.adb(`push ${directory} ${dest}`);
  }

  async setprop(key, value) {
    await this.adb(`shell setprop ${key} ${value}`);
  }

  async listDevices() {
    const [stdout] = await execWithPaths(`adb devices -l`, this.additionalPaths);
    const devices = [];

    // first newline marks the start of the device list.
    let newLine = stdout.indexOf('\n');
    if (newLine === -1) {
      return [];
    }
    let deviceList = stdout.slice(newLine).split('\n');

    // see transports.c in adb for the logic of the parser.
    for (let potentialDevice of deviceList) {
      if (!potentialDevice) {
        continue;
      }

      potentialDevice = potentialDevice.trim();

      const serial = potentialDevice.slice(0, 22).trim();
      const details = potentialDevice.slice(23).split(' ');
      const state = details.shift();

      const extra = {};
      for (let item of details) {
        const [name, value] = item.split(':');
        extra[name] = value;
      }

      devices.push({ serial, state, extra });
    }
    return devices;
  }
}
