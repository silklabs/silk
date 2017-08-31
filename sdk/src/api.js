/**
 * API used by the cli to push and manage files.
 * @noflow
 */
/*eslint-disable no-console*/

import path from 'path';

import {exec} from 'mz/child_process';
import {spawn} from 'child_process';
import which from 'which';
import fs from 'mz/fs';

const SILK_MODULE_ROOT = '/system/silk/node_modules';
const DATA_MODULE_ROOT = '/data/node_modules';
const ACTIVATE_PROP = 'persist.silk.main';
const MODULE_PUSH_PROP = 'silk.module.push';
const WIFI_SETUP_SCRIPT = 'wifi_setup.sh';

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
      maxBuffer: 1024 * 1024 * 10, // 10MB - |adb push| can be verbose
      timeout,
    });
  } catch (err) {
    throw new Error(`An error occured while running: ${cmd} ${err.stack}`);
  }
}

export class SDKApi {
  device = null;
  additionalPaths = [];
  _adbPath = null;

  constructor(opts) {
    for (let key in opts) {
      this[key] = opts[key];
    }
  }

  async adb(adbCmd, timeout = 10000) {
    let cmd = `adb`;
    if (this.device) {
      cmd += ` -s ${this.device}`;
    }
    return execWithPaths(`${cmd} ${adbCmd}`, this.additionalPaths, timeout);
  }

  async restart() {
    await this.stop();
    await this.start();
  }

  async start() {
    await this.adb(`shell start`);
  }

  async stop() {
    await this.adb(`shell stop`);
  }

  async activate(name) {
    if (!name) {
      this.setprop(ACTIVATE_PROP, '\\"\\"');
    } else {
      this.setprop(ACTIVATE_PROP, name);
    }
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
      stdio: 'pipe',
    });
  }

  async pushModule(name, directory, system = false) {
    const dest = path.join(system ? SILK_MODULE_ROOT : DATA_MODULE_ROOT, name);
    await this.adb('root');
    await this.adb('wait-for-device');
    if (system) {
      let [stdout] = await this.adb('shell getprop partition.system.verified');
      let verified = stdout.replace(/\r?\n$/, '');
      if (verified === '1') {
        throw new Error('Verity enabled.  Run |adb disable-verity && adb reboot| to continue');
      }
      await this.adb('remount');
    }

    // XXX: This potentially makes things slower but ensures we don't leave
    // around files between pushes which is a common source of bugs.
    console.log('Updating', dest);
    await this.adb(`shell rm -rf ${dest}`);
    await this.adb(`push ${directory} ${dest}`, /*timeout = */ 300 * 1000);
    this.setprop(MODULE_PUSH_PROP, dest);
  }

  async setprop(key, value) {
    await this.adb(`shell setprop ${key} ${value}`);
  }

  async listDevices() {
    const [stdout] = await this.adb(`devices -l`, this.additionalPaths);
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

      devices.push({serial, state, extra});
    }
    return devices;
  }

  async setupWifi(ssid, password, keepExistingNetworks = false) {
    if (this.device === 'sim') {
      return true; // Nothing to update on simulator
    }

    console.log(`Setup Wi-Fi network: ${ssid} ${password} ...`);
    let result = false;

    // Generate wifi setup script
    try {
      const data = `
        set -ex
        iface=$(wpa_cli ifname | busybox tail -n1)
        if [ "$iface" = "UNKNOWN COMMAND" ]; then
          iface="$(getprop wifi.interface)";
          # gonks older than N need an additional IFNAME=
          ifaceArgs="-i$iface IFNAME=$iface";
        else
          ifaceArgs="-i$iface";
        fi
        echo "wifi interface: $iface"
        w="wpa_cli $ifaceArgs"
        set -x
        $w ping
        # Ok if this next command fails, it is only needed by a few devices
        $w update_config 1 || true

        if [ ${keepExistingNetworks} != true ]; then
          $w remove_network all
          $w save_config
          $w disconnect
        fi

        id=$($w add_network)
        $w set_network $id ssid '"${ssid}"'

        if [ -n "${password}" ]; then
          $w set_network $id psk '"${password}"'
        else
          $w set_network $id key_mgmt NONE
        fi

        $w enable_network $id
        $w save_config
        $w reconnect
        $w status
      `;

      await fs.writeFile(WIFI_SETUP_SCRIPT, data);
      await fs.chmod(WIFI_SETUP_SCRIPT, '400');

      // Push the script on the device
      await this.adb('root');
      await this.adb('wait-for-device');
      await this.adb(`push ${WIFI_SETUP_SCRIPT} /data/`);

      // Run the script on the device or simulator
      let [stdout] = await this.adb(`shell sh /data/${WIFI_SETUP_SCRIPT}`);
      console.log(stdout);
      result = true;
    } catch (err) {
      console.log(`Failed to configure wifi ${err}`);
    }

    // Delete the script
    try {
      await fs.unlink(WIFI_SETUP_SCRIPT);
      await this.adb(`shell rm /data/${WIFI_SETUP_SCRIPT}`);
    } catch (err) {
      console.log(`Failed to cleanup ${err}`);
    }

    return result;
  }
}
