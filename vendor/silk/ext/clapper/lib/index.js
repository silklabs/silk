/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */
/**
 * Copyright (c) 2015 Silk Laboratories, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Laboratories, Inc.
 */

export default function init(env) {

  let hueLightsOn = false;

  env.timeline.on('clap', count => {
    let tag = count === 1 ? 'clap' : `${count} claps`;
    env.log.info(tag);
    env.timeline.addObject(tag);

    if (count === 2) {
      hueLightsOn = !hueLightsOn;
      env.hue.setState({on: hueLightsOn, intensity: 1.0});
    }
  });
}
