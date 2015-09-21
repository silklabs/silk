/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

import Config from './Config';

let api = require('silk-api-react-native')({ serverUrl: Config.serverUrl });
export default api;
