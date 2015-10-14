/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */
/**
 * Copyright (c) 2015 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

import { getprop } from './sysutils';
import createApi from 'silk-api';

var config = {};

// Check to see if server url should be overriden.
let serverUrl = getprop('persist.silk.server.url', null);
if (serverUrl) {
  config.serverUrl = serverUrl;
}
module.exports = createApi(config);
