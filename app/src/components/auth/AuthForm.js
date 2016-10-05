/**
 * Handles user email/password input dialogs.
 *
 * @flow
 */

import invariant from 'assert';
import React from 'react';
import PureRenderMixin from 'react-addons-pure-render-mixin';
import {
  Alert,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import AsyncComponent from '../abstract/AsyncComponent';
import Button from '../Button';
import { Colors } from '../CommonStyles';

import type {GlobalProps} from '../Root';

class StyledTextInput extends React.Component {
  render() {
    return (
      <TextInput
        ref="input"
        style={styles.textInput}
        autoCapitalize="none"
        autoCorrect={false}
        clearButtonMode="always"
        enablesReturnKeyAutomatically={true}
        placeholderTextColor="#999999"
        {...this.props}
      />
    );
  }

  focus() {
    this.refs.input.focus();
  }

  blur() {
    this.refs.input.blur();
  }
}

export type Credentials = {
  email: string;
  password: string;
};

type AuthFormProps = GlobalProps & {
  password: boolean;
  verifyPassword: boolean;
  primaryLabel: string;
  secondaryLabel: string;
  textLinkLabel?: ?string;
  onPrimary: (credentials: Credentials) => void;
  onSecondary: () => void;
  onTextLink?: ?Function;
  onChangeTextInputFocus: Function;
};

type AuthFormState = {
  email: string;
  password: string;
  passwordVerification: string;
};

export default class AuthForm extends AsyncComponent {

  state: AuthFormState = {
    email: '',
    password: '',
    passwordVerification: '',
  };

  props: AuthFormProps;

  constructor(props: AuthFormProps) {
    super(props);
    invariant(this.props.config.current);
    let {defaultEmail, defaultPassword} = this.props.config.current;
    this.state.email = defaultEmail || '';
    this.state.password = defaultPassword || '';
    if (props.verifyPassword) {
      this.state.passwordVerification = defaultPassword || '';
    }
  }

  // TODO: we can do better here and only compare the sub-state we care about
  shouldComponentUpdate = PureRenderMixin.shouldComponentUpdate;

  onEmailChange = (email: string) => this.setState({email});
  onPasswordChange = (password: string) => this.setState({password});
  onPasswordVerificationChange = (passwordVerification: string) => {
    this.setState({passwordVerification});
  };

  handleSubmit = async () => {
    if (this.haveInvalidInputs()) {
      // It's very unlikely that users will hit this given that the
      // submit button and the return key are disabled in most cases.
      Alert.alert(
        'All fields are required',
        'Please fill out all fields.'
      );
      return;
    }

    if (this.props.password &&
        this.props.verifyPassword &&
        this.state.password !== this.state.passwordVerification) {
      Alert.alert(
        'Password mismatch',
        'Your password did not match its verification.'
      );
      this.setState({
        password: '',
        passwordVerification: '',
      });
      return;
    }
    this.props.onPrimary({
      email: this.state.email,
      password: this.state.password,
    });
  };

  haveInvalidInputs() {
    return (
      !this.state.email ||
      (this.props.password && !this.state.password) ||
      (this.props.verifyPassword && !this.state.passwordVerification)
    );
  }

  focusInput(ref: string) {
    this.props.onChangeTextInputFocus();
    this.refs[ref].focus();
  }

  render() {
    let { password, verifyPassword, textLinkLabel } = this.props;

    let passwordInput = null;
    if (password) {
      passwordInput = (
        <StyledTextInput
          ref="password"
          placeholder="Password"
          value={this.state.password}
          secureTextEntry={true}
          returnKeyType={verifyPassword ? 'next' : 'done'}
          onSubmitEditing={verifyPassword ? () => this.focusInput('passwordVerification') : this.handleSubmit}
          onChangeText={(password) => this.setState({password})}
        />
      );
    }

    let passwordVerificationInput = null;
    if (verifyPassword) {
      passwordVerificationInput = (
        <StyledTextInput
          ref="passwordVerification"
          placeholder="Type password again"
          value={this.state.passwordVerification}
          secureTextEntry={true}
          returnKeyType="done"
          onSubmitEditing={this.handleSubmit}
          onChangeText={this.onPasswordVerificationChange}
        />
      );
    }

    let textLink = null;
    if (textLinkLabel) {
      textLink = (
        <View style={styles.textLinkRow}>
          <View style={styles.textLinkWrapper}>
            <Text
              onPress={this.props.onTextLink}
              style={styles.textLinkLabel}>
              {textLinkLabel}
            </Text>
          </View>
          <View style={styles.textLinkFiller} />
        </View>
      );
    }

    return (
      <View style={this.props.style}>
        <StyledTextInput
          placeholder="Email Address"
          value={this.state.email}
          keyboardType="email-address"
          returnKeyType={password ? 'next' : 'done'}
          onSubmitEditing={password ? () => this.focusInput('password') : this.handleSubmit}
          onChangeText={(email) => this.setState({email})}
        />
        {passwordInput}
        {passwordVerificationInput}
        {textLink}
        <View style={styles.buttonRow}>
          <Button
            label={this.props.secondaryLabel}
            type="secondary"
            onPress={this.props.onSecondary}
          />
          <Button
            label={this.props.primaryLabel}
            style={styles.primaryButton}
            type="primary"
            onPress={this.handleSubmit}
            disabled={this.haveInvalidInputs() || !!this.props.auth.currentOperation}
          />
        </View>
      </View>
    );
  }

}

const styles = StyleSheet.create({
  textInput: {
    fontFamily: 'Open Sans',
    fontSize: 12,
    backgroundColor: 'white',
    borderRadius: 2,
    height: 40,
    marginBottom: 15,
    paddingLeft: 20,
  },
  textLinkRow: {
    paddingBottom: 2,
    marginBottom: 10,
    flexDirection: 'row',
  },
  textLinkWrapper: {
    borderBottomColor: Colors.SilkLabsBlack,
    borderBottomWidth: 2,
  },
  textLinkLabel: {
    fontFamily: 'DIN Round Pro',
    fontWeight: '600',
    color: Colors.SilkLabsBlack,
    backgroundColor: 'transparent',
  },
  textLinkFiller: {
    flex: 1,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-end',
    flex: 1,
  },
  primaryButton: {
    marginLeft: 16,
  },
});
