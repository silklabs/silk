/**
 * @flow
 */

import invariant from 'assert';

function sleep(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 10));
}

export class DialogStorage {

  _data: (void | Object) = undefined;
  _promise: Promise<void> = Promise.resolve();

  get(): Promise<void | Object> {
    return this._chain(() => this._get());
  }

  set(data: void | Object): Promise<void> {
    invariant(data === undefined || (data && typeof data === `object`));
    if (data !== undefined) {
      data = {...data};
    }
    return this._chain(() => this._set(data));
  }

  _chain(func: (() => Promise<any>)): Promise<void> {
    const promise = this._promise.then(func);
    this._promise = promise.catch((error) => undefined).then(() => undefined);
    return promise;
  }

  async _get(): Promise<any> {
    await sleep();
    return this._data;
  }

  async _set(data: void | Object): Promise<void> {
    await sleep();
    this._data = data;
  }
}

/**
 * Global DialogStorage object
 * @memberof silk-device-storage
 */
const storage = new DialogStorage();
export default storage;
