/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

import React from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import AsyncComponent from './AsyncComponent';
import UserForm from './UserForm';
import TextLink from './TextLink';

let {
  StyleSheet,
  View,
} = React;

class SignUpControls extends AsyncComponent {

  static propTypes = {
    navigator: React.PropTypes.object,
    userState: React.PropTypes.object,
  };

  onTermsAndConditions = () => {
    console.log('TODO: ToC');
  };

  onSignUp = async (props) => {
    try {
      let { userState } = this.props;
      await userState.attemptSignup(props.email, props.password);
    } catch (err) {
      console.log('Failed to sign up', err);
    }
  };

  render() {
    return (
      <UserForm
        onSubmit={this.onSignUp}
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

