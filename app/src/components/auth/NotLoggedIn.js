import React from 'react';
import {
  Alert,
  DeviceEventEmitter,
  Image,
  LayoutAnimation,
  Navigator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SilkApi } from 'silk-api';
import createLog from 'silk-log';

import Config from '../../libraries/Config';
import { UserState } from '../../libraries/UserState';

import AsyncComponent from '../abstract/AsyncComponent';
import AuthForm from './AuthForm';
import Button from '../Button';
import { Colors } from '../CommonStyles';
import NetworkWarning from '../NetworkWarning';
import LoginMetric from '../../metrics/Login';

const log = createLog('NotLoggedIn');

export default class NotLoggedIn extends AsyncComponent {

  static propTypes = {
    api: React.PropTypes.instanceOf(SilkApi).isRequired,
    userState: React.PropTypes.instanceOf(UserState).isRequired,
  };

  state = {
    controls: null, // null, 'signup', 'signin'
    inProgress: false,
    keyboardShown: false,
    contentInsetBottom: 0,
  };

  componentWillMount() {
    this._subscriptions = [
      DeviceEventEmitter.addListener('keyboardWillShow', this.onKeyboardShow),
      DeviceEventEmitter.addListener('keyboardWillHide', this.onKeyboardHide),
    ];
  }

  componentWillUnmount() {
    this._subscriptions.forEach(sub => sub.remove());
  }

  // Avoid bouncing the view unnecessarily when focus jumps from one
  // text input to the next.
  _animateKeyboard = true;
  _disableKeyboardAnimation = () => {
    this._animateKeyboard = false;
  };

  onKeyboardShow = (event) => {
    LayoutAnimation.easeInEaseOut();
    this.setState({
      keyboardShown: true,
      contentInsetBottom: event.endCoordinates.height,
    });
  };

  onKeyboardHide = (event) => {
    if (!this._animateKeyboard) {
      this._animateKeyboard = true;
      return;
    }
    LayoutAnimation.easeInEaseOut();
    this.setState({
      keyboardShown: false,
      contentInsetBottom: 0,
    });
  };

  _goBack = () => {
    this.setState({
      controls: null,
      // Pre-emptively expand ScrollView again to avoid two
      // re-renders, one from hiding the controls and one from
      // dismissing the keyboard.
      keyboardShown: false,
      contentInsetBottom: 0,
    });
  };

  _renderWordmark() {
    return (
        <View style={[styles.wordmark, this.state.keyboardShown ? null : styles.wordmarkStretch]}>
        <Text style={styles.wordmarkLabel}>SILK</Text>
      </View>
    );
  }

  _renderFirstScreen() {
    let serverPickerButton = null;
    let { showServerPicker } = Config.get().preferences;
    if (showServerPicker) {
      serverPickerButton = (
        <Button
          style={styles.button}
          label="Change Server"
          type="secondary"
          onPress={() => this.props.navigator.push({name: 'ServerPicker'})}
        />
      );
    }
    return (
      <View style={styles.controlsContainer}>
        <Button
          style={styles.button}
          label="Create An Account"
          type="primary"
          onPress={() => this.setState({controls: 'signup'})}
        />
        <Button
          style={styles.button}
          label="I Already Have An Account"
          type="primary"
          onPress={() => this.setState({controls: 'signin'})}
        />
        {serverPickerButton}
      </View>
    );
  }

  _renderSignUp() {
    return (
      <View style={styles.controlsContainer}>
        <AuthForm
          style={styles.authForm}
          inProgress={this.state.inProgress}
          password={true}
          verifyPassword={true}
          primaryLabel="Sign Up"
          secondaryLabel="Cancel"
          onPrimary={this._signUp}
          onSecondary={this._goBack}
          onChangeTextInputFocus={this._disableKeyboardAnimation}
        />
      </View>
    );
  }

  _signUp = async (credentials) => {
    let { userState } = this.props;
    this.setStateAsync({ inProgress: true });
    try {
      let success = await userState.attemptSignup(credentials.email, credentials.password);
      if (success) {
        return;
      }
    } catch (err) {
      log.info('Failed to sign up', err);
    }
    Alert.alert(
      'Error',
      'Something went wrong. Please try again.'
    );
    this.setStateAsync({ inProgress: false });
  };

  _renderSignIn() {
    return (
      <View style={styles.controlsContainer}>
        <AuthForm
          style={styles.authForm}
          inProgress={this.state.inProgress}
          password={true}
          verifyPassword={false}
          primaryLabel="Sign In"
          secondaryLabel="Back"
          textLinkLabel="Forgot your password?"
          onPrimary={this._signIn}
          onSecondary={this._goBack}
          onTextLink={() => this.setState({controls: 'forgot_password'})}
          onChangeTextInputFocus={this._disableKeyboardAnimation}
        />
      </View>
    );
  }

  _renderForgotPassword() {
    return (
      <View style={styles.controlsContainer}>
        <AuthForm
          style={styles.authForm}
          inProgress={this.state.inProgress}
          password={false}
          verifyPassword={false}
          primaryLabel="Reset Password"
          secondaryLabel="Cancel"
          onPrimary={this._forgotPassword}
          onSecondary={this._goBack}
          onChangeTextInputFocus={this._disableKeyboardAnimation}
        />
      </View>
    );
  }

  _signIn = async (credentials) => {
    const { userState } = this.props;
    this.setStateAsync({ inProgress: true });
    try {
      const success = await userState.attemptSignIn(credentials.email, credentials.password);
      if (success) {
        this.props.api.metrics.add(new LoginMetric());
        return;
      }
      Alert.alert(
        'Error',
        'Invalid username or password. Please try again'
      );
    } catch (err) {
      log.info('Failed to sign in', err);
      Alert.alert(
        'Error',
        'Could not connect to server. Please try again.'
      );
    }
    this.setStateAsync({ inProgress: false });
  };

  _forgotPassword = async (credentials) => {
    const { userState } = this.props;
    this.setStateAsync({ inProgress: true });

    let title = 'Error';
    let message = 'Could not connect to server. Please try again.';

    try {
      const success = await userState.forgotPassword(credentials.email);
      if (success) {
        title = 'Success';
        message = 'A password reset email has been sent!';
        this.setStateAsync({ controls: 'signin' });
      } else {
        message = 'Failed to send password reset. Please try again.';
      }
    } catch (err) {
      log.info('Failed to reset password', err);
      if (err.code === 404) {
        // Server will send 404 if it cannot find the account...
        message = 'This email address is not registered with an account.';
      }
    } finally {
      this.setStateAsync({ inProgress: false });
      Alert.alert(title, message);
    }
  };

  _renderControls() {
    switch (this.state.controls) {
    case 'signup':
      return this._renderSignUp();
    case 'signin':
      return this._renderSignIn();
    case 'forgot_password':
      return this._renderForgotPassword();
    default:
      return this._renderFirstScreen();
    }
  }

  render() {
    let extraStyle = null;
    if (this.state.keyboardShown) {
      extraStyle = {
        paddingBottom: this.state.contentInsetBottom,
      };
    }
    // This is a ScrollView not because we need scrolling, but we need
    // to play well with the native keyboard.
    return (
      <ScrollView
        contentContainerStyle={[styles.container, extraStyle]}
        keyboardShouldPersistTaps={true}
        alwaysBounceVertical={false}
        scrollable={false}>
        <Image
          source={require('image!background_pattern')}
          style={styles.pattern}
        />
        <View style={styles.statusBar} />
        <NetworkWarning api={this.props.api} />
        <View style={styles.content}>
          {this._renderWordmark()}
          {this._renderControls()}
        </View>
      </ScrollView>
    );
  }

}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.SilkLabsRed,
  },
  pattern: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0.2,
  },

  statusBar: {
    height: Navigator.NavigationBar.Styles.General.StatusBarHeight,
  },

  content: {
    flex: 1,
  },

  wordmark: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 24,
  },
  wordmarkStretch: {
    flex: 1,
  },
  wordmarkLabel: {
    fontFamily: 'DIN Round Pro',
    fontSize: 48,
    color: Colors.SilkLabsYellow,
    backgroundColor: 'transparent',
  },

  title: {
    fontFamily: 'DIN Round Pro',
    fontSize: 24,
    color: 'white',
    backgroundColor: 'transparent',
  },

  authForm: {
    flex: 1,
  },

  forgotPasswordLabel: {
    fontFamily: 'DIN Round Pro',
    fontWeight: '600',
    color: Colors.SilkLabsBlack,
    backgroundColor: 'transparent',
    borderBottomColor: Colors.SilkLabsBlack,
    borderBottomWidth: 2,
  },

  button: {
    width: 200,
    margin: 10,
  },

  controlsContainer: {
    flex: 1,
    paddingHorizontal: 32,
    paddingBottom: 24,
    alignItems: 'center',
  },
});
