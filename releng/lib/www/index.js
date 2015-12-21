
import debug from 'debug';
debug.enable('silk-*');

// Activate better Error stack traces
import 'source-map-support/browser-source-map-support';
sourceMapSupport.install(); //eslint-disable-line no-undef

import version from 'silk-core-version';
import raygun from 'silk-raygun/browser';
if (version.official) {
  // Enable crash reporting as early as practical
  raygun.enable('releng', version.semver, {
    customData: {
      version,
    },
  });
}

import React from 'react'; //eslint-disable-line no-unused-vars
import ReactDOM from 'react-dom';
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

// Little helper for folks who like to hit page refresh.
window.addEventListener('beforeunload', function (e) {
  if (!version.official) {
    // Skip the confirmation message in non-official builds
    // (ie, during development)
    return null;
  }
  if (!userState.signedIn()) {
    return null;
  }

  let confirmationMessage = 'Github login will be discarded.';

  e.returnValue = confirmationMessage;     // Gecko, Trident, Chrome 34+
  return confirmationMessage;              // Gecko, WebKit, Chrome <34
});

(async function main() {
  try {
    ReactDOM.render((
      <Router>
        <Route path="/login" component={Login} userState={userState} />
        <Route onEnter={loginCheck} path="/prd" component={Prd} userState={userState} />
        <Redirect from="*" to="/prd" />
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
