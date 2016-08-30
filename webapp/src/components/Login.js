/* global gapi */
/* eslint-disable camelcase */

import Config from '../libraries/Config';
import React from 'react';
import { Alert, ButtonInput, Panel, Input, Row, Col } from 'react-bootstrap';

export default class Login extends React.Component {
  static propTypes = {
    history: React.PropTypes.object.isRequired,
    location: React.PropTypes.object.isRequired,
    route: React.PropTypes.shape({
      userState: React.PropTypes.object.isRequired,
    }),
  };

  state = {};

  resetForm = () => {
    this.setState({
      alertMessage: null,
      submitDisabled: true,
      signingIn: false,
    });

    if (Config.defaultUser && Config.defaultPassword) {
      this.setState({ submitDisabled: false });
    }
  };

  onGoogleLoginSuccess = async (googleUser) => {
    if (this.state.signingIn) {
      return;
    }
    this.setState({ signingIn: true, submitDisabled: true});

    const id_token = googleUser.getAuthResponse().id_token;

    console.log('Logged in as: ' + googleUser.getBasicProfile().getName());
    console.log('For more see https://www.googleapis.com/oauth2/v3/tokeninfo?id_token=' + id_token);

    try {
      let success = await this.props.route.userState.attemptSignInWithToken('google', id_token);
      if (!success) {
        throw new Error('Unable to sign in. Check username and password.');
      }
      this.gotoOriginalUrl();
    } catch (err) {
      this.setState({ alertMessage: err.message });
      this.setState({ signingIn: false, submitDisabled: false});
    }
  }

  doSignOut = async () => {
    await this.props.route.userState.signOut();
  };

  gotoOriginalUrl() {
    const { history, location } = this.props;
    if (location.state && location.state.nextPathname) {
      history.replaceState(null, location.state.nextPathname);
    } else {
      history.replaceState(null, '/');
    }
  }

  doSignIn = async(email, pass) => {
    try {
      let success = await this.props.route.userState.attemptSignInWithPassword(email, pass);
      if (!success) {
        throw new Error('Unable to sign in. Check username and password.');
      }
      this.gotoOriginalUrl();
    } catch (err) {
      this.setState({ alertMessage: err.message });
      this.setState({ signingIn: false, submitDisabled: false});
    }
  };

  componentWillMount() {
    this.doSignOut();
    this.resetForm();
  }

  _renderGoogleLogin() {
    const auth2 = gapi.auth2.getAuthInstance();

    auth2.signOut()
    .then(() => {
      gapi.signin2.render('google-signin-button', {
        onsuccess: this.onGoogleLoginSuccess,
      });
    });
  }

  componentDidMount() {
    if (gapi.auth2) {
      this._renderGoogleLogin();
      return;
    }
    gapi.load('auth2', () => {
      gapi.auth2.init({
        // See https://console.cloud.google.com/apis/credentials?project=silk-app-sdk-example
        client_id: '797108770604-i4b0g9l40jktg54qsj5h0d1maqatbji3.apps.googleusercontent.com',
        cookiepolicy: 'none',
      })
      .then(() => this._renderGoogleLogin());
    });

  }

  handleSubmit = (event) => {
    event.preventDefault();
    this.setState({ signingIn: true, submitDisabled: true });

    const email = this.refs.email.getValue();
    const pass = this.refs.pass.getValue();
    this.doSignIn(email, pass);
  };

  handleChange = () => {
    const email = this.refs.email.getValue();
    const pass = this.refs.pass.getValue();
    // Don't bother the server for clearly invalid emails and passwords
    this.setState({ submitDisabled: email.length < 3 || pass.length < 4 });
  };

  render() {
    const panelStyle = {maxWidth: 400, margin: '10px auto 10px'};
    return (
      <Panel style={panelStyle} header="Web Console Login">
        {this.state.alertMessage && (
          <Alert bsStyle="danger">{this.state.alertMessage}</Alert>
        )}
        <form onSubmit={this.handleSubmit}>
          <Input
            type="email"
            ref="email"
            defaultValue={Config.defaultUser}
            placeholder="Email Address"
            onChange={this.handleChange}
          />
          <Input
            type="password"
            ref="pass"
            defaultValue={Config.defaultPassword}
            placeholder="Password"
            onChange={this.handleChange}
          />
          <Row>
            <Col xs={6}>
              <ButtonInput
                type="submit"
                bsStyle="primary"
                value={this.state.signingIn ? 'Signing In...' : 'Sign In'}
                disabled={this.state.submitDisabled}
              />
            </Col>
            <Col xs={6}>
              <ButtonInput
                type="reset"
                bsStyle="warning"
                value="Reset"
                onClick={this.resetForm}
              />
            </Col>
          </Row>
        </form>
        <hr/>
        <div id="google-signin-button"></div>
      </Panel>
    );
  }
}
