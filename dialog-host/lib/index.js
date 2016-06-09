/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @flow
 */

import createLog from 'silk-log';
import invariant from 'assert';

import Audio from './audio';
import {createDialogEngine} from 'silk-dialog-engine';

import type {DialogEngineOptions} from 'silk-dialog-engine';

const log = createLog('dialog-demo');

const options: DialogEngineOptions = {
  // TODO
};

log.info(`Creating dialog engine`);
const dialogEngine = createDialogEngine(options);
invariant(dialogEngine);

log.info(`Initializing dialog script`);
require('silk-dialog-script');

log.info(`Creating audio connection`);
const audio = new Audio();
audio.addListener(`speech`, (stream) => dialogEngine.interpret(stream));
dialogEngine.addListener(
  `speech`,
  (stream, finished) => audio.speak(stream, finished)
);
