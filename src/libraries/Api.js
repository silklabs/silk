/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

import Config from './Config';
import createApi from 'silk-api';

let api = createApi({ serverUrl: Config.serverUrl });
export default api;
