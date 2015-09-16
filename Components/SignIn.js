/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

import React from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import UserForm from './UserForm';
import TextLink from './TextLink';

import { WordMarkText } from './Text';

let {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ActivityIndicatorIOS
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
};

class SignInControls extends React.Component {

  static propTypes = {
    userState: React.PropTypes.object
  }

  onSignIn = () => {
    // TODO: proper sign-in flow
    this.props.navigator.push({ name: 'Monitors', index: 0 });
  }

  onDeveloperSignIn = async () => {
    let { userState } = this.props;

    this.setState({ loginInProgress: true });
    let success = await userState.attemptDeveloperLogin();
    this.setState({ loginInProgress: false });
    if (success) {
      this.props.navigator.push({ name: 'Monitors', index: 0 });
    }
  }

  onSignUp = () => {
    this.props.navigator.push({ name: 'SignUp', index: 0 });
  }

  onLearnMore = () => {
    console.log('Learn More');
  }

  render() {
    return (
      <UserForm
        onSubmit={this.onSignUp}
        submitText='Sign In'
        style={styles.signInContainer}>

        <View style={styles.bottomLinks}>
          <TextLink label='SIGN UP'
                    onClick={this.onSignIn} />
          <TextLink label='DEVELOPER'
                     onClick={this.onDeveloperSignIn} />
          <TextLink label='LEARN MORE'
                    onClick={this.onLearnMore}/>
        </View>
      </UserForm>
    );
  }
}

export default class extends React.Component {

  static propTypes = {
    navigator: React.PropTypes.object,
    userState: React.PropTypes.userState
  }

  render() {
    return (
      <View style={styles.container}>
        <View style={styles.statusBar} />
        <LinearGradient colors={['#efefef', '#1d292f']}
                        style={styles.container}>
          <View style={styles.logoContainer}>
            <LogoView />
          </View>
          <View style={styles.controlsContainer}>
            <SignInControls
              userState={this.props.userState}
              navigator={this.props.navigator} />
          </View>
        </LinearGradient>
      </View>
    );
  }
};

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
