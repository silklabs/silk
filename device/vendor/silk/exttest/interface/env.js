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

type CameraFrameFormat = 'fullgray' | 'fullrgb' | 'highgray' | 'gray' | 'grayeq' | 'rgb' | 'lowgray';
type CameraCallback = (err: boolean, image: any) => void;

declare export class Camera extends EventEmitter {
  getFrame(when: number,
      formats: Array<CameraFrameFormat>): Promise<Array<any>>;
}

type TimelineEventObject = {
  tag: string;
  when: number;
  [arbitraryKeys: string]: any;
};

declare export class Timeline extends EventEmitter {
  addDiagFrame (id: string, when: number, frame: any): void;
  addObjects (objects: Array<TimelineEventObject>): void;
  getNextObjectId (): number;
}

declare export class Sensors extends EventEmitter {
  light (pollInterval: number): void;
}

declare export class Env extends EventEmitter {
  util: Util;
  say: Say;
  log: Log;
  camera: Camera;
  timeline: Timeline;
  sensors: Sensors;
}

declare var env: Env;
declare export default typeof env;
