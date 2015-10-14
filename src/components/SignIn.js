/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

import React from 'react-native';
import createLog from 'log';

import LinearGradient from 'react-native-linear-gradient';
import AsyncComponent from './AsyncComponent';
import UserForm from './UserForm';
import TextLink from './TextLink';
import { WordMarkText } from './Text';

const log = createLog('SignIn');

let {
  AlertIOS,
  StyleSheet,
  View,
} = React;

class LogoView extends React.Component {
  render() {
    return (
      <View style={styles.logoEltsContainer}>
        <View style={styles.logo}/>
        <WordMarkText />
      </View>
    );
  }
}

const DEVELOPER_CREDENTIALS = {};

class SignInControls extends AsyncComponent {

  static propTypes = {
    userState: React.PropTypes.object,
  };

  state = {
    loginInProgress: false,
  };

  onSignIn = async (credentials) => {
    let { userState } = this.props;
    this.setStateAsync({ loginInProgress: true });
    try {
      let success = false;
      if (credentials === DEVELOPER_CREDENTIALS) {
        success = await userState.attemptDeveloperLogin();
      } else {
        success = await userState.attemptSignIn(credentials.email, credentials.password);
      }
      if (success) {
        this.props.navigator.pushAsync({ name: 'Tabs', index: 0 });
        return;
      }
      AlertIOS.alert(
        'Error',
        'Invalid username or password. Please try again'
      );
    } catch (err) {
      log.info('Failed to sign in', err);
      AlertIOS.alert(
        'Error',
        'Could not connect to server. Please try again.'
      );
    }
    this.setStateAsync({ loginInProgress: false });
  };

  onSignUp = () => {
    this.props.navigator.pushAsync({ name: 'SignUp', index: 0 });
  };

  onLearnMore = () => {
    console.log('Learn More');
  };

  render() {
    return (
      <UserForm
        onSubmit={this.onSignIn}
        inProgress={this.state.loginInProgress}
        submitText="Sign In"
        style={styles.signInContainer}>
        <View style={styles.bottomLinks}>
          <TextLink
            label="SIGN UP"
            onClick={this.onSignUp}
          />
          <TextLink
            label="DEVELOPER"
            onClick={() => this.onSignIn(DEVELOPER_CREDENTIALS)}
          />
          <TextLink
            label="LEARN MORE"
            onClick={this.onLearnMore}
          />
        </View>
      </UserForm>
    );
  }
}

export default class extends React.Component {

  static propTypes = {
    navigator: React.PropTypes.object,
    userState: React.PropTypes.object,
  };

  render() {
    return (
      <View style={styles.container}>
        <View style={styles.statusBar} />
        <LinearGradient
          colors={['#efefef', '#1d292f']}
          style={styles.container}>
          <View style={styles.logoContainer}>
            <LogoView />
          </View>
          <View style={styles.controlsContainer}>
            <SignInControls
              userState={this.props.userState}
              navigator={this.props.navigator}
            />
          </View>
        </LinearGradient>
      </View>
    );
  }
}

var styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  statusBar: {
    height: 20,
    backgroundColor: '#dfdfdf',
  },

  logoContainer: {
    flex: 0.45,
  },
  logoEltsContainer: {
    flex: 1,
    alignSelf: 'center',
    justifyContent: 'flex-end',
  },
  logo: {
    width: 110,
    height: 110,
    borderRadius: 55,
    borderWidth: 0.75,
    borderColor: '#979797',
    backgroundColor: '#d8d8d8',
    padding: 20,
  },

  controlsContainer: {
    flex: 0.55,
  },
  signInContainer: {
    flex: 1.0,
    paddingLeft: 30,
    paddingRight: 30,
    paddingTop: 40,
  },
  bottomLinks: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'space-between',
    flexDirection: 'row',
  },
});
