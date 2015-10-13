/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

import React from 'react-native';
import AsyncComponent from './AsyncComponent';
import UserForm from './UserForm';
import TextLink from './TextLink';

import { WordMarkText } from './Text';

let {
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

class SignInControls extends AsyncComponent {

  static propTypes = {
    navigator: React.PropTypes.object,
    userState: React.PropTypes.object,
  };

  onSignIn = async (props) => {
    try {
      let { userState } = this.props;
      await userState.attemptSignIn(props.email, props.password);
    } catch (err) {
      console.log('Failed to sign in', err);
    }
  };

  onDeveloperSignIn = async () => {
    let { userState } = this.props;

    this.setStateAsync({ loginInProgress: true });
    await userState.attemptDeveloperLogin();
    this.setStateAsync({ loginInProgress: false });
  };

  onSignUp = () => {
    this.props.navigator.pushAsync({ name: 'SignUp' });
  };

  onLearnMore = () => {
    console.log('Learn More');
  };

  render() {
    return (
      <UserForm
        onSubmit={this.onSignIn}
        submitText="Sign In"
        style={styles.signInContainer}>
        <View style={styles.bottomLinks}>
          <TextLink
            label="SIGN UP"
            onClick={this.onSignUp}
          />
          <TextLink
            label="DEVELOPER"
            onClick={this.onDeveloperSignIn}
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
        <View style={styles.container}>
          <View style={styles.logoContainer}>
            <LogoView />
          </View>
          <View style={styles.controlsContainer}>
            <SignInControls
              userState={this.props.userState}
              navigator={this.props.navigator}
            />
          </View>
        </View>
      </View>
    );
  }
}

var styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#dfdfdf',
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
