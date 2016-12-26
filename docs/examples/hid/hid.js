/*
 * @noflow
 */

import assert from 'assert';
import fs from 'mz/fs';
import {getstrprop, setprop} from 'silk-sysutils';
import sleep from './sleep';
import makeLog from 'silk-log';

const log = makeLog('hid');

// Ensures the HID function in the USB Android gadget driver is active
async function enableHID() {
  const usbConfig = getstrprop('sys.usb.state');
  if (!usbConfig.startsWith('hid,')) {
    log.warn('HID function does not seem to be enabled.');
    const usbConfigWithHid = `hid,${usbConfig}`;
    log.info(`changing USB config to ${usbConfigWithHid}`);

    // WARNING!  If this device is not Kenzo or this otherwise fails, it's likely
    // that adb access will be lost until the next reboot
    setprop('sys.usb.config', usbConfigWithHid);

    // Wait for USB to be reconfigured.
    await sleep(1000);

    const newUsbConfig = getstrprop('sys.usb.state');
    if (newUsbConfig !== usbConfigWithHid) {
      throw new Error(`USB config expected to be ${usbConfigWithHid}, but it was ${newUsbConfig}`);
    }
  }

  // Ensure the two HID devices are present
  Promise.all(
    ['/dev/hidg0', '/dev/hidg1'].map(
      file => fs.access(file, fs.constants.R_OK | fs.constants.W_OK)
    )
  );
}

const keyboardModifierMap = {
  'left-ctrl': 0x01,
  'right-ctrl': 0x10,
  'left-shift': 0x02,
  'right-shift': 0x20,
  'left-alt': 0x04,
  'right-alt': 0x40,
  'left-meta': 0x08,
  'right-meta': 0x80,
};

const keyboardKeyValues = {
  'a': 0x04,
  'b': 0x05,
  'c': 0x06,
  'd': 0x07,
  'e': 0x08,
  'f': 0x09,
  'g': 0x0a,
  'h': 0x0b,
  'i': 0x0c,
  'j': 0x0d,
  'k': 0x0e,
  'l': 0x0f,
  'm': 0x10,
  'n': 0x11,
  'o': 0x12,
  'p': 0x13,
  'q': 0x14,
  'r': 0x15,
  's': 0x16,
  't': 0x17,
  'u': 0x18,
  'v': 0x19,
  'w': 0x1a,
  'x': 0x1b,
  'y': 0x1c,
  'z': 0x1d,
  '1': 0x1e,
  '2': 0x1f,
  '3': 0x20,
  '4': 0x21,
  '5': 0x22,
  '6': 0x23,
  '7': 0x24,
  '8': 0x25,
  '9': 0x26,
  '0': 0x27,
  'return': 0x28,
  'esc': 0x29,
  'bckspc': 0x2a,
  'tab': 0x2b,
  'spacebar': 0x2c,
  '-': 0x2d,
  '=': 0x2e,
  '[': 0x2f,
  ']': 0x30,
  '\\': 0x31,
  ';': 0x33,
  '\'': 0x34,
  '`': 0x35,
  ',': 0x36,
  '.': 0x37,
  '/': 0x38,
  'caps-lock': 0x39,
  'f1': 0x3a,
  'f2': 0x3b,
  'f3': 0x3c,
  'f4': 0x3d,
  'f5': 0x3e,
  'f6': 0x3f,
  'f7': 0x40,
  'f8': 0x41,
  'f9': 0x42,
  'f10': 0x43,
  'f11': 0x44,
  'f12': 0x45,
  'insert': 0x49,
  'home': 0x4a,
  'pageup': 0x4b,
  'del': 0x4c,
  'end': 0x4d,
  'pagedown': 0x4e,
  'right': 0x4f,
  'left': 0x50,
  'down': 0x51,
  'up': 0x52,
  'num-lock': 0x53,
};

export class Keyboard {
  _fd: number;
  _pressedKey: number;
  _modState: {[x: string]: boolean};

  static async create(): Promise<Keyboard> {
    await enableHID();
    const fd = await fs.open('/dev/hidg0', 'r+');
    return new Keyboard(fd);
  }

  /*
   * @private
   */
  constructor(fd) {
    this._fd = fd;
    this._pressedKey = 0;
    this._modState = {};
    for (let mod in keyboardModifierMap) {
      this._modState[mod] = false;
    }
  }

  /*
   * @private
   */
  async _sendReport() {
    let modifiers = 0;
    for (let mod in keyboardModifierMap) {
      if (this._modState[mod]) {
        modifiers |= keyboardModifierMap[mod];
      }
    }
    const report = Buffer.from([modifiers, 0, this._pressedKey, 0, 0, 0, 0, 0]);
    await fs.write(this._fd, report, 0, report.length);
  }

  async press(key: string) {
    if (typeof keyboardModifierMap[key] === 'number') {
      this._modState[key] = true;
    } else if (typeof keyboardKeyValues[key] === 'number') {
      this._pressedKey = keyboardKeyValues[key];
    } else {
      throw new Error(`Invalid key press: ${key}`);
    }
    await this._sendReport();
  }

  async release(key: string) {
    if (typeof keyboardModifierMap[key] === 'number') {
      this._modState[key] = false;
    } else if (typeof keyboardKeyValues[key] === 'number') {
      if (this._pressedKey !== keyboardKeyValues[key]) {
        log.warn('TODO: Support concurent key presses?  The HID report does support up to 6');
      }
      this._pressedKey = 0;
    } else {
      throw new Error(`Invalid key press: ${key}`);
    }
    await this._sendReport();
  }
}


export type MouseButton = 'left' | 'right';

const mouseModifierMap = {
  'left': 0x01,
  'right': 0x02,
};

export class Mouse {
  _fd: number;
  _buttonState: {[x: MouseButton]: boolean};

  static async create(): Promise<Mouse> {
    await enableHID();
    const fd = await fs.open('/dev/hidg1', 'r+');
    return new Mouse(fd);
  }

  /*
   * @private
   */
  constructor(fd) {
    this._fd = fd;
    this._buttonState = {
      'left': false,
      'right': false,
    };
  }

  /*
   * @private
   */
  async _sendReport(x: number, y: number) {
    let buttons = 0;
    for (let button in mouseModifierMap) {
      if (this._buttonState[button]) {
        buttons |= mouseModifierMap[button];
      }
    }
    const report = Buffer.from([buttons, x, y, 0, 0]);
    await fs.write(this._fd, report, 0, report.length);
  }

  async press(button: MouseButton = 'left') {
    assert(typeof this._buttonState[button] === 'boolean', `Invalid button: ${button}`);
    this._buttonState[button] = true;
    await this._sendReport(0, 0);
  }

  async release(button: MouseButton = 'left') {
    assert(typeof this._buttonState[button] === 'boolean', `Invalid button: ${button}`);
    this._buttonState[button] = false;
    await this._sendReport(0, 0);
  }

  async click(button: MouseButton = 'left') {
    await this.press(button);
    assert(this.isPressed(button));
    await this.release(button);
  }

  async move(x: number, y: number) {
    assert(x >= -127 && x <= 127, 'Invalid x value');
    assert(y >= -127 && y <= 127, 'Invalid y value');
    await this._sendReport(x, y);
  }

  isPressed(button: MouseButton = 'left'): boolean {
    assert(typeof this._buttonState[button] === 'boolean', `Invalid button: ${button}`);
    return this._buttonState[button];
  }
}

