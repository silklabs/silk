/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */


import Config from './libraries/Config';
import debug from 'debug';
debug.enable(Config.debug);

import React from 'react';
import { Router, Route } from 'react-router';
import 'whatwg-fetch'; // window.fetch() polyfill for iOS

import CameraVideo from './components/CameraVideo';
import CrashReports from './components/CrashReports';
import Diag from './components/Diag';
import { OnlineCamera, OnlineCameras } from './components/OnlineCameras';
import VideoChunks from './components/VideoChunks';

React.render((
  <Router>
    <Route path="/" component={OnlineCameras} />
    <Route path="/chunks/:deviceId" component={VideoChunks} />
    <Route path="/crashes/:deviceId" component={CrashReports} />
    <Route path="/diag/:deviceId" component={Diag} />
    <Route path="/preview/:deviceId" component={OnlineCamera} />
    <Route path="/video/:deviceId" component={CameraVideo} />
  </Router>
), document.body);
