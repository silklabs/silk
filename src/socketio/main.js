/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

import createServer from './server';
import bootstrap from '../bootstrap';

bootstrap(createServer);

const WATCHDOG_MS = 250;
const BOGGED_DOWN_MS = WATCHDOG_MS * 2;
let lastDogTick = Date.now();
function watchdog() {
  let diff = Date.now() - lastDogTick;
  if (diff > BOGGED_DOWN_MS) {
    console.error(`====[ Main thread was bogged down for ${diff - WATCHDOG_MS}ms ]====`);
  }
  lastDogTick = Date.now();
  setTimeout(watchdog, WATCHDOG_MS);
}
watchdog();
