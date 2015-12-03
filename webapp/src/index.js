/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */


import Config from './libraries/Config';
import api from './libraries/Api';
import loadUserState from './libraries/UserState';

import debug from 'debug';
debug.enable(Config.debug);

import React from 'react';
import { Router, Route } from 'react-router';
import { Alert } from 'react-bootstrap';

import 'whatwg-fetch'; // window.fetch() polyfill for iOS

import AVPipeline from './components/AVPipeline';
import CameraVideo from './components/CameraVideo';
import CameraVideoMSE from './components/CameraVideoMSE';
import CrashReports from './components/CrashReports';
import Diag from './components/Diag';
import Login from './components/Login';
import ForgotPassword from './components/ForgotPassword';
import { OnlineCamera, OnlineCameras } from './components/OnlineCameras';
import VideoChunks from './components/VideoChunks';

let videoWidget = CameraVideo;
let userState;

if (Config.dashSegmenter) {
  console.log('Attepting to use MSE playback widget ...');
  if ('MediaSource' in window) {
    console.log('  OK.');
    videoWidget = CameraVideoMSE;
  } else {
    console.log('  sorry, MSE not found.');
  }
}

function loginCheck(nextState, replaceState) {
  if (!userState || !userState.accessToken) {
    replaceState({ nextPathname: nextState.location.pathname }, '/login');
  }
}

(async function main() {
  try {
    userState = await loadUserState(api);
    React.render((
      <Router>
        <Route path="/login" component={Login} userState={userState} />
        <Route onEnter={loginCheck} path="/" component={OnlineCameras} />
        <Route onEnter={loginCheck} path="/avpipeline/:deviceId" component={AVPipeline} />
        <Route onEnter={loginCheck} path="/chunks/:deviceId" component={VideoChunks} />
        <Route onEnter={loginCheck} path="/crashes/:deviceId" component={CrashReports} />
        <Route onEnter={loginCheck} path="/diag/:deviceId" component={Diag} />
        <Route onEnter={loginCheck} path="/preview/:deviceId" component={OnlineCamera} />
        <Route onEnter={loginCheck} path="/video/:deviceId" component={videoWidget} />
        <Route path="/forgot_password" component={ForgotPassword} userState={userState} />
      </Router>
    ), document.body);
  } catch (err) {
    React.render((
      <Alert bsStyle="danger">
        <strong>Oops</strong><pre>{err.stack}</pre>
      </Alert>
    ), document.body);
  }
})();
