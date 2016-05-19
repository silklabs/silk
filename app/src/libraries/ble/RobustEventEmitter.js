/**
 * A robust EventEmitter that will never cause a fatal exception on
 * 'error' events.
 *
 * @flow
 */

import { EventEmitter } from 'events';
import createLog from 'silk-log';

const log = createLog('RobustEventEmitter');

export default class RobustEventEmitter extends EventEmitter {

  constructor() {
    super();
    this.addListener(`error`, this._onError);
  }

  removeAllListeners(event?: string): this {
    super.removeAllListeners(event);

    if (event === 'error' || arguments.length === 0) {
      this.addListener(`error`, this._onError);
    }

    return this;
  }

  _onError: (error: Error) => void = (error) => {
    if (this.listenerCount('error') === 1) {
      log.error(`Unhandled 'error' event:`, error);
    }
  };

}
