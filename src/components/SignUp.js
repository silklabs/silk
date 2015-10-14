/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

import React from 'react-native';
import createLog from 'log';

import LinearGradient from 'react-native-linear-gradient';
import AsyncComponent from './AsyncComponent';
import UserForm from './UserForm';
import TextLink from './TextLink';

const log = createLog('SignIn');

let {
  AlertIOS,
  StyleSheet,
  View,
} = React;

class SignUpControls extends AsyncComponent {

  static propTypes = {
    navigator: React.PropTypes.object,
    userState: React.PropTypes.object,
  };

  state = {
    loginInProgress: false,
  };

  onTermsAndConditions = () => {
    console.log('TODO: ToC');
  };

  onSignUp = async (props) => {
    let { userState } = this.props;
    this.setStateAsync({ loginInProgress: true });
    try {
      let success = await userState.attemptSignup(props.email, props.password);
      if (success) {
        this.props.navigator.pushAsync({ name: 'Tabs', index: 0 });
        return;
      }
    } catch (err) {
      log.info('Failed to sign up', err);
    }
    AlertIOS.alert(
      'Error',
      'Something went wrong. Please try again.'
    );
    this.setStateAsync({ loginInProgress: false });
  };

  render() {
    return (
      <UserForm
        onSubmit={this.onSignUp}
        inProgress={this.state.loginInProgress}
        submitText="Sign Up"
        style={styles.signInContainer}>

        <View style={styles.bottomLinks}>
          <TextLink
            label="Terms & Conditions"
            onClick={this.onTermsAndConditions}
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
          <View style={styles.logoContainer} />
          <View style={styles.controlsContainer}>
            <SignUpControls
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

