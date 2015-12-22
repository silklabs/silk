/**
 * Handles user email/password input dialogs.
 */

import React from 'react-native';
import Config from '../../libraries/Config';

let {
  AlertIOS,
  StyleSheet,
  TextInput,
  View,
} = React;

import AsyncComponent from '../abstract/AsyncComponent';
import Button from './Button';

const inputStyles = StyleSheet.create({
  text: {
    fontFamily: 'Open Sans',
    fontSize: 12,
    backgroundColor: 'white',
    borderRadius: 2,
    height: 40,
    marginBottom: 15,
    paddingLeft: 20,
  },
});

class StyledTextInput extends React.Component {
  render() {
    return (
      <TextInput
        ref="input"
        style={inputStyles.text}
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
    submitText: React.PropTypes.string.isRequired,
    password: React.PropTypes.bool.isRequired,
    verifyPassword: React.PropTypes.bool.isRequired,
    onSubmit: React.PropTypes.func.isRequired,
    inProgress: React.PropTypes.bool.isRequired,
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
      AlertIOS.alert(
        'All fields are required',
        'Please fill out all fields.'
      );
      return;
    }

    if (this.props.password &&
        this.props.verifyPassword &&
        this.state.password !== this.state.passwordVerification) {
      AlertIOS.alert(
        'Password mismatch',
        'Your password did not match its verification.'
      );
      this.setState({
        password: '',
        passwordVerification: '',
      });
      return;
    }
    this.props.onSubmit({
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

  render() {
    let { password, verifyPassword } = this.props;

    let button = (
      <Button
        label={this.props.submitText}
        onPress={this.handleSubmit}
        inProgress={this.props.inProgress}
        disabled={this.haveInvalidInputs()}
      />
    );

    let emailInput = (
      <StyledTextInput
        placeholder="Email Address"
        value={this.state.email}
        keyboardType="email-address"
        returnKeyType={password ? 'next' : 'done'}
        onSubmitEditing={password ? () => this.refs.password.focus() : this.handleSubmit}
        onChangeText={(email) => this.setState({email})}
      />
    );

    let passwordInput = null;
    if (password) {
      passwordInput = (
        <StyledTextInput
          ref="password"
          placeholder="Password"
          value={this.state.password}
          secureTextEntry={true}
          returnKeyType={verifyPassword ? 'next' : 'done'}
          onSubmitEditing={verifyPassword ? () => this.refs.passwordVerification.focus() : this.handleSubmit}
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

    return (
      <View style={this.props.style}>
        {emailInput}
        {passwordInput}
        {passwordVerificationInput}
        {button}
      </View>
    );
  }

}
