/**
 * @flow
 */

import invariant from 'assert';
import React from 'react';
import PureRenderMixin from 'react-addons-pure-render-mixin';
import {
  Alert,
  Image,
  Keyboard,
  LayoutAnimation,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import * as actions from '../../store/actions';
import AsyncComponent from '../abstract/AsyncComponent';
import AuthForm from './AuthForm';
import Button from '../Button';
import { Colors, LayoutStyles } from '../CommonStyles';
import NetworkWarning from '../NetworkWarning';

import type {GlobalProps} from '../Root';
import type {Credentials} from './AuthForm';

type KeyboardShowEvent = {
  endCoordinates: {
    height: number;
    width: number;
  };
};

export default class NotLoggedIn extends AsyncComponent {

  props: GlobalProps;

  state = {
    controls: null, // null, 'signup', 'signin'
    inProgress: false,
    keyboardShown: false,
    contentInsetBottom: 0,
  };

  componentWillMount() {
    this._subscriptions = [
      Keyboard.addListener('keyboardWillShow', this.onKeyboardShow),
      Keyboard.addListener('keyboardWillHide', this.onKeyboardHide),
      {
        remove: this.props.store.subscribeToPath(
          'auth.currentOperation.error',
          this._onAuthError
        ),
      },
    ];
  }

  // TODO: we can do better here and only compare the sub-state we care about
  shouldComponentUpdate = PureRenderMixin.shouldComponentUpdate;

  _onAuthError = (error: ?Error, previousError: ?Error) => {
    if (!error || previousError) {
      return;
    }

    // TODO: inspect `error` here and provide more meaningful error
    // messages.
    Alert.alert(
      'Could not complete operation',
      'Check email address and/or password.',
      [{text: 'Ok', onPress: this._ackError}]
    );
  };

  _ackError = () => {
    this.props.dispatch(actions.auth.ackError());
  };

  componentWillUnmount() {
    this._subscriptions.forEach(sub => sub.remove());
  }

  // Avoid bouncing the view unnecessarily when focus jumps from one
  // text input to the next.
  _animateKeyboard = true;
  _disableKeyboardAnimation = () => {
    this._animateKeyboard = false;
  };

  onKeyboardShow = (event: KeyboardShowEvent) => {
    LayoutAnimation.easeInEaseOut();
    this.setState({
      keyboardShown: true,
      contentInsetBottom: event.endCoordinates.height,
    });
  };

  onKeyboardHide = () => {
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
    invariant(this.props.config.current);
    const {showServerPicker} = this.props.config.current;
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
          {...this.props}
          style={styles.authForm}
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

  _signUp(credentials: Credentials) {
    this.props.dispatch(actions.auth.createAccount({
      userAgent: 'app',
      ...credentials,
    }));
  }

  _signUp: ((credentials: Credentials) => void) = this._signUp.bind(this);

  _renderSignIn() {
    return (
      <View style={styles.controlsContainer}>
        <AuthForm
          {...this.props}
          style={styles.authForm}
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
          {...this.props}
          style={styles.authForm}
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

  _signIn(credentials: Credentials) {
    this.props.dispatch(actions.auth.signInWithPassword({
      userAgent: 'app',
      ...credentials,
    }));
  }

  _signIn: ((credentials: Credentials) => void) = this._signIn.bind(this);

  _forgotPassword(credentials: Credentials) {
    this.props.dispatch(actions.auth.resetPassword({
      ...credentials,
    }));
  }

  _forgotPassword: ((credentials: Credentials) => void)
    = this._forgotPassword.bind(this);

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
          source={require('../../assets/background_pattern.png')}
          style={styles.pattern}
        />
        <View style={LayoutStyles.statusBarPlaceholder} />
        <NetworkWarning {...this.props} />
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
