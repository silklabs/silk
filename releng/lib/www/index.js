
import debug from 'debug';
debug.enable('silk-*');

// Activate better Error stack traces
import 'source-map-support/browser-source-map-support';
sourceMapSupport.install(); //eslint-disable-line no-undef

import version from 'silk-core-version';
import raygun from 'silk-raygun/browser';
if (version.official) {
  // Enable crash reporting as early as practical
  raygun.enable('releng', version.semver);
}

import React from 'react';
import { Router, Route, Redirect } from 'react-router';
import { Alert } from 'react-bootstrap';
import Login from './components/Login';
import Prd from './components/Prd';
import Octokat from 'octokat'; // Ref: https://www.npmjs.com/package/octokat

import createLog from 'log';
const log = createLog('main');

class UserState {
  zen = '"No comment" is a comment.';
  octo = null;

  async attemptSignIn(username, password) {
    log.info('UserState:attemptSignIn');

    this.octo = new Octokat({ username, password });
    this.zen = await this.octo.zen.read();
    log.info(this.zen);
    return true;
  }

  async signOut() {
    log.info('UserState:signOut');
    this.octo = null;
  }

  signedIn() {
    return this.octo !== null;
  }
}
let userState = new UserState();

function loginCheck(nextState, replaceState) {
  if (!userState.signedIn()) {
    log.info('Redirecting to /login');
    replaceState({ nextPathname: nextState.location.pathname }, '/login');
  }
}

(async function main() {
  try {
    React.render((
      <Router>
        <Route path="/login" component={Login} userState={userState} />
        <Route onEnter={loginCheck} path="/prd" component={Prd} userState={userState} />
        <Redirect from="*" to="/prd" />
      </Router>
    ), document.body);
  } catch (err) {
    React.render((
      <Alert bsStyle="danger">
        <strong>Oops</strong><pre>{err.stack}</pre>
      </Alert>
    ), document.body);
    raygun.send(err);
  }
})();
