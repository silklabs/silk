/**
 * Copyright (c) 2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @flow
 */

import modwatcher from 'silk-modwatcher';
import type { ModulePushCallback } from 'silk-modwatcher';

import { createDialogEngine } from 'silk-dialog-engine/lib/dialogEngine';
import type { DialogEngine, DialogEngineOptions } from 'silk-dialog-engine/lib/dialogEngine';

import path from 'path';
import createLog from 'silk-log/device';
const log = createLog('silkext-dialog');

/**
 * Where to search for the dialog engine
 */
const DIALOGSCRIPT_MODNAME = 'silk-dialog-script';

class Dialog {
  _de: DialogEngine;

  constructor() {
    this._monitor(true);

    const options: DialogEngineOptions = {
      // TODO
    };
    this._de = createDialogEngine(options);
    this._loadDialogScript();
  }

  /**
   * Try to load DIALOGSCRIPT_MODNAME
   */
  _loadDialogScript(): void {
    try {
      modwatcher.require(DIALOGSCRIPT_MODNAME);
      const modLocation = modwatcher.require.resolve(DIALOGSCRIPT_MODNAME);
      log.info(`${DIALOGSCRIPT_MODNAME} loaded from ${modLocation}`);
    } catch (e) {
      log.warn('Unable to load', DIALOGSCRIPT_MODNAME, ':', e.stack || e);
    }
  }

  /**
   * Register/deregister for notifications of DIALOGSCRIPT_MODNAME changes
   */
  _monitor(enable: bool): void {
    if (!process.env.NODE_PATH) {
      return;
    }
    const monitorDirs: Array<string> = process.env.NODE_PATH.split(path.delimiter);
    monitorDirs.forEach(dir => {
      modwatcher.monitor(path.join(dir, DIALOGSCRIPT_MODNAME),
                         enable ? this._onModulePush : null);
    });
  }

  /**
   * Reload DIALOGSCRIPT_MODNAME
   */
  _onModulePush: ModulePushCallback = (modulePath: string) => {
    this._loadDialogScript();
  };

  willUnload(): void {
    this._monitor(false);
    modwatcher.flush(DIALOGSCRIPT_MODNAME);
  }
}

let dialog = new Dialog();
export function silkWillUnload() {
  dialog.willUnload();
}
