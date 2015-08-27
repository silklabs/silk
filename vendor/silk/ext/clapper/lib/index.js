/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */
/**
 * Copyright (c) 2015 Silk Laboratories, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Laboratories, Inc.
 */

// Property to enable sounds when claps detected
const CLAPPER_PLAY_SOUND_PROP = 'persist.silk.clapper.sound';

const TWO_CLAPS_FILENAME = 'two_claps_detected.mp3';

export default function init(env) {
  let hueLightsOn = false;
  let soundEnabled = env.util.getboolprop(CLAPPER_PLAY_SOUND_PROP);

  env.timeline.on('clap', count => {
    let tag = count === 1 ? 'clap' : `${count} claps`;

    if (count >= 2) {
      env.log.info(tag);
      if (soundEnabled) {
        env.util.playSound(TWO_CLAPS_FILENAME);
      }
      env.timeline.addObject(tag);
    }

    if (count === 2) {
      hueLightsOn = !hueLightsOn;
      env.hue.setState({on: hueLightsOn, intensity: 1.0});
    }
  });
}
