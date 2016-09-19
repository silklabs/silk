/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc
 *
 * @private
 * @flow
 */

import createLog from 'silk-log/device';
import minimatch from 'minimatch';
import path from 'path';
import { getprop, getboolprop, setprop, propWatcher } from 'silk-sysutils';

const log = createLog('module_watcher');
const MODULE_PUSH_PROP = 'silk.module.push';

/**
 * Export a function from your module named this symbol to receive a synchronous
 * callback immediately before your module will be unloaded.
 *
 * @example
 * // myes6module.js
 * console.log('Hello');
 * export function silkWillUnload() { console.log('Farewell'); }
 */
export const WillUnloadSymbol = 'silkWillUnload'; //TODO: use Symbol('silkWillUnload');

/**
 * Webpack works by replacing require with a specialized version which loads
 * from the bundle.  This is a trick to get the correct require from webpack
 */
const moduleRequire = ((() => {
  try {
    // $FlowFixMe
    return __non_webpack_require__;  //eslint-disable-line
  } catch (err) {
    return require;
  }
})());

export type ModulePushCallback = (modulePath: string) => void;
type ModulePathPattern = string; // minimatch filepath glob

class ModuleWatcher {
  _list: {[key: ModulePathPattern]: ModulePushCallback} = {};

  require: ((mod: string) => any) = moduleRequire;

  constructor() {
    if (!getboolprop('ro.debuggable')) {
      return; // Disabled for production builds
    }
    propWatcher.on(MODULE_PUSH_PROP, this._onModulePush);
    this.monitor(path.resolve(__dirname, '..'), (modulePath) => {
      log.warn('Goodbye cruel world');
    });
  }

  _onModulePush: (() => void) = () => {
    const modName = getprop(MODULE_PUSH_PROP);
    if (!modName) {
      return;
    }
    log.verbose(`Module pushed: ${modName}`);

    // Ignore leading '/' for better sim compat.
    // TODO: can a minimatch glob do this?
    const modPattern = modName[0] === '/' ? modName.substring(1) : modName;

    const found = Object.keys(this._list).some(
      pattern => {
        if (minimatch(modPattern, pattern)) {
          this.flush(modName);
          this._list[pattern](modName);
          return true;
        }
        return false;
      }
    );
    if (!found) {
      log.verbose(`${modName} is unmonitored`);
    }

    // Set prop to empty string to indicate done
    setprop(MODULE_PUSH_PROP, '');
  };

  /**
   * Register a callback for when a particular module bath pattern changes
   *
   * Pass a null callback to deregister
   */
  monitor(modulePathPattern: string, callback: ?ModulePushCallback): void {
    // Ignore leading '/' for better sim compat. TODO: can a minimatch glob do this?
    const pattern = modulePathPattern[0] === '/' ?
      modulePathPattern.substring(1) : modulePathPattern;
    if (!callback) {
      delete this._list[pattern];
    } else {
      this._list[pattern] = callback;
    }
  }

  /**
   * Delete the module from cache to force next load from disk
   */
  flush(modName: string): boolean {
    // require.cache alias not present for some reason, let's add it
    if (moduleRequire.cache === undefined) {
      // $FlowFixMe - flow can't resolve 'module'?
      moduleRequire.cache = require('module')._cache; // eslint-disable-line import/no-require
    }
    const modLocation = moduleRequire.resolve(modName);
    if (moduleRequire.cache[modLocation]) {
      log.verbose(`Unloading ${modLocation}`);

      try {
        // Notify the module it's getting unloaded
        const willUnload = moduleRequire.cache[modLocation].exports[WillUnloadSymbol];
        if (willUnload) {
          willUnload();
        }
      } catch (e) {
        log.info('willUnload threw', e.stack || e);
      }
      delete moduleRequire.cache[modLocation];
      return true;
    }
    return false;
  }

}

let watcher = new ModuleWatcher();
export default watcher;
