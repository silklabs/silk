/**
 * @flow
 */

import DialogEngine from './dialogEngine';

import type {DialogEngineOptions} from './dialogEngine';

let instance: ?DialogEngine = null;

export function createDialogEngine(
  options: DialogEngineOptions,
): DialogEngine {
  if (!instance) {
    instance = new DialogEngine(options);
  }
  return instance;
}

export default function getDialogEngine(): DialogEngine {
  if (!instance) {
    throw new Error(`Must call createDialogEngine() first!`);
  }

  return instance;
}
