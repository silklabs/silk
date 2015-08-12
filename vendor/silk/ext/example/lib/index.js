/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

export default function init(env) {
  let log = env.log;
  log.info('Hello from the example extension');

  env.clapDetector.on('clap', cnt => {
    log.info('*********************** clap detected ***************', cnt);
  });
}
