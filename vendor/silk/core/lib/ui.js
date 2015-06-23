/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

let vib = require('./vibrator')();
let movie = require('movie')();
let util = require('./util');

let currentState;

function uiState(state) {
  if (state === currentState) {
    return;
  }
  currentState = state;

  let zipName = state;
  switch (state) {
  case 'connecting':
    vib.pattern(500);
    zipName = 'bootanimation';
    break;
  case 'online':
    vib.pattern(500, 250, 500);
    break;
  default:
    break;
  }

  movie.stop();
  // Hack! movie.run() will fail while the previous movie is shutting down, and
  // movie.run() is non-blocking.  Add a terrible little delay to compensate...
  util.timeout(500).then(() => {
    try {
      console.log(`ui state: ${state}`);
      movie.run(`/system/media/${zipName}.zip`);
    } catch (e) {
      console.log(e);
    }
  });
}

module.exports = uiState;
