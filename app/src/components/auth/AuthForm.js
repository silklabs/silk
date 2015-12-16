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
  static defaultProps = {
    secure: false,
    keyboardType: 'default',
    returnKeyType: 'done',
  };

  static propTypes = TextInput.propTypes;

  render() {
    return (
      <TextInput
        style={inputStyles.text}
        autoCapitalize="none"
        autoCorrect={false}
        placeholderTextColor="#999999"
        {...this.props}
      />
    );
  }
}

export default class extends AsyncComponent {

  static propTypes = {
    style: View.propTypes.style,
    submitText: React.PropTypes.string.isRequired,
    verifyPassword: React.PropTypes.bool.isRequired,
    onSubmit: React.PropTypes.func.isRequired,
    inProgress: React.PropTypes.bool.isRequired,
    skipPassword: React.PropTypes.bool.isRequired,
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
      this.state.email = defaultEmail;
      this.state.password = defaultPassword;
    }
  }

  onEmailChange = (email) => this.setState({email});
  onPasswordChange = (password) => this.setState({password});
  onPasswordVerificationChange = (passwordVerification) => {
    this.setState({passwordVerification});
  };

  handleSubmit = async () => {
    if (this.props.verifyPassword &&
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

  render() {
    let buttonDisabled = (
      !this.state.email || // Always require email
      (!this.props.skipPassword && !this.state.password) || // Only require password if not skipped
      (this.state.verifyPassword && !this.state.passwordVerification) // Pasword mismatch ...
    );

    let button = (
      <Button
        label={this.props.submitText}
        onPress={this.handleSubmit}
        inProgress={this.props.inProgress}
        disabled={buttonDisabled}
      />
    );

    let passwordVerification = null;
    if (this.props.verifyPassword) {
      passwordVerification = (
        <StyledTextInput
          placeholder="Type password again"
          value={this.state.passwordVerification}
          secureTextEntry={true}
          onSubmitEditing={this.handleSubmit}
          onChangeText={this.onPasswordVerificationChange}
        />
      );
    }

    let password = null;
    if (this.props.skipPassword !== true) {
      password = (
        <StyledTextInput
          placeholder="Password"
          value={this.state.password}
          secureTextEntry={true}
          onSubmitEditing={this.handleSubmit}
          onChangeText={(password) => this.setState({password})}
        />
      );
    }

    return (
      <View style={this.props.style}>
        <StyledTextInput
          placeholder="Email Address"
          value={this.state.email}
          keyboardType="email-address"
          onSubmitEditing={this.handleSubmit}
          onChangeText={(email) => this.setState({email})}
        />
        {password}
        {passwordVerification}
        {button}
      </View>
    );
  }

}
