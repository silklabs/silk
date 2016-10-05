
// Activate better Error stack traces
import 'source-map-support/browser-source-map-support';
sourceMapSupport.install(); //eslint-disable-line no-undef

import version from 'silk-core-version';
import raygun from 'silk-raygun/browser';
if (version.official) {
  // Enable crash reporting as early as practical
  raygun.enable('webapp', version.semver, {
    customData: {
      version,
    },
  });
}

import Config from './libraries/Config';
import Cameras from './libraries/Cameras';
import api from './libraries/Api';
import loadUserState from './libraries/UserState';

import { configureLog } from 'silk-log';
configureLog(Config.debug);

import React from 'react'; //eslint-disable-line no-unused-vars
import ReactDOM from 'react-dom';
import { Router, Route } from 'react-router';
import { Alert } from 'react-bootstrap';

import 'whatwg-fetch'; // window.fetch() polyfill for iOS

import AudioStudio from './components/AudioStudio';
import AVPipeline from './components/AVPipeline';
import CameraVideo from './components/CameraVideo';
import FindCrashById from './components/FindCrashById';
import Diag from './components/Diag';
import Login from './components/Login';
import ForgotPassword from './components/ForgotPassword';
import { OnlineCamera, OnlineCameras } from './components/OnlineCameras';
import MissingChunks from './components/MissingChunks';
import EventViewer from './components/EventViewer';
import WebRTCVideoList from './components/WebRTCVideoList';
import DataChannel from './components/DataChannel';

let userState;

function loginCheck(nextState, replaceState) {
  if (!userState || !userState.accessToken) {
    replaceState({ nextPathname: nextState.location.pathname }, '/login');
  }
}

(async function main() {
  try {
    userState = await loadUserState(api);
    if (userState.accessToken) {
      Cameras.connect();
    }
    userState.on('authenticated', () => Cameras.connect());
    userState.on('unauthenticated', () => Cameras.disconnect());

    ReactDOM.render((
      <Router>
        <Route path="/login" component={Login} userState={userState} />
        <Route onEnter={loginCheck} path="/" component={OnlineCameras} />
        <Route onEnter={loginCheck} path="/avpipeline/:deviceId" component={AVPipeline} />
        <Route onEnter={loginCheck} path="/chunks/:deviceId" component={MissingChunks} />
        <Route onEnter={loginCheck} path="/eventviewer/:deviceId" component={EventViewer} />
        <Route onEnter={loginCheck} path="/crashById/:crashId" component={FindCrashById} />
        <Route onEnter={loginCheck} path="/diag/:deviceId" component={Diag} />
        <Route onEnter={loginCheck} path="/preview/:deviceId" component={OnlineCamera} />
        <Route onEnter={loginCheck} path="/video/:deviceId" component={CameraVideo} />
        <Route onEnter={loginCheck} path="/audiostudio/:deviceId" component={AudioStudio} />
        <Route onEnter={loginCheck} path="/webrtc/:deviceId" component={WebRTCVideoList} />
        <Route onEnter={loginCheck} path="/datachannel/:deviceId" component={DataChannel} />
        <Route path="/forgot_password" component={ForgotPassword} userState={userState} />
      </Router>
    ), document.getElementById('root'));
  } catch (err) {
    ReactDOM.render((
      <Alert bsStyle="danger">
        <strong>Oops</strong><pre>{err.stack}</pre>
      </Alert>
    ), document.getElementById('root'));
    raygun.send(err);
  }
})();
