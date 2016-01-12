/**
 * Copyright (c) 2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @providesModule env
 * @flow
 */

import { EventEmitter } from 'events';

declare export class Util {
  playSound(fileName: string): void;
  getboolprop(prop: string, defaultValue: boolean): boolean;
  getintprop(prop: string, defaultValue: number): number;
  getprop(prop: string, defaultValue: string): string;
  setprop(prop: string, value: string): void;
}

declare export class Say {
  speak(text: string): void;
}

declare export class Log {
  verbose(log: string): void;
  warn(log: string): void;
  error(log: string): void;
  debug(log: string): void;
  info(log: string): void;
}

declare export class Camera extends EventEmitter {
}

declare export class Env extends EventEmitter {
  util: Util;
  say: Say;
  log: Log;
  camera: Camera;
}

declare var env: Env;
declare export default typeof env;
