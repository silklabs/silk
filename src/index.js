/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */


import Config from './libraries/Config';
import debug from 'debug';
debug.enable(Config.debug);

import React from 'react';
import { Router, Route } from 'react-router';
import 'whatwg-fetch'; // window.fetch() polyfill for iOS

import AVPipeline from './components/AVPipeline';
import CameraVideo from './components/CameraVideo';
import CameraVideoMSE from './components/CameraVideoMSE';
import CrashReports from './components/CrashReports';
import Diag from './components/Diag';
import { OnlineCamera, OnlineCameras } from './components/OnlineCameras';
import VideoChunks from './components/VideoChunks';

let videoWidget = CameraVideo;
if (Config.dashSegmenter) {
  console.log('Attepting to use MSE playback widget ...');
  if ('MediaSource' in window) {
    console.log('  OK.');
    videoWidget = CameraVideoMSE;
  } else {
    console.log('  sorry, MSE not found.');
  }
}

React.render((
  <Router>
    <Route path="/" component={OnlineCameras} />
    <Route path="/avpipeline/:deviceId" component={AVPipeline} />
    <Route path="/chunks/:deviceId" component={VideoChunks} />
    <Route path="/crashes/:deviceId" component={CrashReports} />
    <Route path="/diag/:deviceId" component={Diag} />
    <Route path="/preview/:deviceId" component={OnlineCamera} />
    <Route path="/video/:deviceId" component={videoWidget} />
  </Router>
), document.body);
