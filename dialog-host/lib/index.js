/**
 * Copyright (c) 2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @flow
 */

import mock from 'mock-require';
import {DialogStorage} from 'silk-dialog-storage';

mock('silk-dialog-storage',
     new DialogStorage({path: `/tmp/_silk-dialog-storage_/data`}));

import createLog from 'silk-log';
import invariant from 'assert';

import Audio from './audio';
import {createDialogEngine} from 'silk-dialog-engine';
import netstatus from 'silk-netstatus';

import type {DialogEngineOptions, DialogState} from 'silk-dialog-engine';

const log = createLog('dialog-demo');

const options: DialogEngineOptions = {
  // TODO
};

netstatus.start();

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
  (stream: Buffer, nextState: DialogState) => audio.speak(stream, nextState)
);
