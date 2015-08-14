/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

export default function init(env) {
  env.clapDetector.on('clap', cnt => {
    let tag = cnt === 1 ? 'clap' : `${cnt} claps`;
    env.log.info(tag);
    env.camera.addObject(tag);
  });
}
