/**
 * Copyright (c) 2015 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

import makeLog from 'log';
import { Transform } from 'stream';

const EVENT_NAME_CLOSE = `close`;
const EVENT_NAME_END = `end`;
const EVENT_NAME_ERROR = `error`;

const log = makeLog(`api-streams-closing_transform`);

export default class ClosingTransform extends Transform {

  __constructorName = ``;
  __finalEventName = '';

  constructor(options) {
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

  emit(eventName, ...args) {
    switch (eventName) {
    case EVENT_NAME_END:
    case EVENT_NAME_ERROR:
      if (this.__finalEventName) {
        log.warn(`[${this.__constructorName}] Blocked the '${eventName}' ` +
                 `event after a previous '${this.__finalEventName}' event`);
        return;
      }
      this.__finalEventName = eventName;
      break;

    default:
      break;
    }

    return super.emit(eventName, ...args);
  }

}
