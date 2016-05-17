/**
 * Handles user email/password input dialogs.
 */

import React from 'react';
import {
  Alert,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import Config from '../../libraries/Config';

import AsyncComponent from '../abstract/AsyncComponent';
import Button from '../Button';
import { Colors } from '../CommonStyles';

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

export default class AuthForm extends AsyncComponent {

  static propTypes = {
    style: View.propTypes.style,
    password: React.PropTypes.bool.isRequired,
    verifyPassword: React.PropTypes.bool.isRequired,
    inProgress: React.PropTypes.bool.isRequired,
    primaryLabel: React.PropTypes.string.isRequired,
    secondaryLabel: React.PropTypes.string.isRequired,
    textLinkLabel: React.PropTypes.string,
    onPrimary: React.PropTypes.func.isRequired,
    onSecondary: React.PropTypes.func.isRequired,
    onTextLink: React.PropTypes.func,
    onChangeTextInputFocus: React.PropTypes.func.isRequired,
  };

  state = {
    email: '',
    password: '',
    passwordVerification: '',
  };

  constructor(props) {
    super(props);
    if (!this.props.verifyPassword) {
      let { defaultEmail, defaultPassword } = Config.get();
      this.state.email = defaultEmail || '';
      this.state.password = defaultPassword || '';
    }
  }

  onEmailChange = (email) => this.setState({email});
  onPasswordChange = (password) => this.setState({password});
  onPasswordVerificationChange = (passwordVerification) => {
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

  focusInput(ref) {
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
            disabled={this.haveInvalidInputs() || this.props.inProgress}
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
