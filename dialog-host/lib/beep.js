/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * Flow disabled because `play-sound` package isn't normally installed.
 * @noflow
 */

import createPlayer from 'play-sound';
import invariant from 'assert';
import path from 'path';
import createLog from 'silk-log';

const log = createLog(`beep`);

let player: ?Object = null;

const filenames = {
  startListen: `hotkeyword_detected.mp3`,
  stopListen: `stopListen.mp3`,
  error: `motion_detected.mp3`,
};

export default function beep(type: string): Promise<void> {
  let filename = filenames[type];
  if (!filename) {
    throw new Error(`Unknown type ${type}`);
  }

  filename = path.join(`media`, filename);
  log.info(`playSound`, filename);

  return new Promise((resolve, reject) => {
    if (!player) {
      player = createPlayer();
      if (!player) {
        reject(new Error(`Failed to create player`));
        return;
      }
    }

    invariant(player);
    player.play(filename, (error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
}
