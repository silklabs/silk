/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @flow
 */

import makeLog from 'silk-log';
import { Transform } from 'stream';

import type { DuplexStreamOptions } from './types';

const EVENT_NAME_CLOSE = `close`;
const EVENT_NAME_END = `end`;
const EVENT_NAME_ERROR = `error`;

const log = makeLog(`streams:closing_transform`);

export default class ClosingTransform extends Transform {

  __constructorName: string = ``;
  __finalEventName: string = '';

  constructor(options?: DuplexStreamOptions) {
    super(options);

    this.__constructorName = this.constructor.name;

    const emitClose = () => {
      this.removeListener(EVENT_NAME_END, emitClose);
      this.removeListener(EVENT_NAME_ERROR, emitClose);

      process.nextTick(() => this.emit(EVENT_NAME_CLOSE));
    };

    this.addListener(EVENT_NAME_END, emitClose);
    this.addListener(EVENT_NAME_ERROR, emitClose);
  }

  emit(eventName: string, ...args: Array<any>): boolean {
    switch (eventName) {
    case EVENT_NAME_END:
    case EVENT_NAME_ERROR:
      if (this.__finalEventName) {
        log.warn(`[${this.__constructorName}] Blocked the '${eventName}' ` +
                 `event after a previous '${this.__finalEventName}' event`);
        return false;
      }
      this.__finalEventName = eventName;
      break;

    default:
      break;
    }

    return super.emit(eventName, ...args);
  }

}
