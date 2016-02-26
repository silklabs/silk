import React from 'react'; // eslint-disable-line no-unused-vars
import ReactDOM from 'react-dom';
import { default as createLog, configureLog } from 'silk-log';

import Config from '../libraries/Config';
import AndroidJSHelper from './AndroidJSHelper';
import WebviewMSEPlayer from './WebviewMSEPlayer';

configureLog(Config.debug);
const log = createLog('Webview');

// This lets native Android code call into Javascript by executing
// `silkJSHelper.blabla()` in the global namespace.
log.debug('Initializing silkJSHelper.');
window.silkJSHelper = new AndroidJSHelper();

document.addEventListener('DOMContentLoaded', () => {
  log.debug('DOM loaded, rendering MSEPlayer.');
  document.body.style.margin = 0;
  document.body.style.width = '100%';
  document.body.style.height = '100%';
  let div = document.createElement('div');
  div.style.width = '100%';
  div.style.height = '100%';
  document.body.appendChild(div);
  ReactDOM.render(<WebviewMSEPlayer eventEmitter={window.silkJSHelper} />, div);
});
