/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

import * as crypto from './crypto';
import * as duplex_transform from './duplex_transform';
import * as msgpack from './msgpack';

export default function(config) {
  if (`getRandomBytes` in config) {
    crypto.setRandomBytesFunction(config.getRandomBytes);
  }

  return Object.assign(
    { },
    crypto,
    duplex_transform,
    msgpack
  );
}
