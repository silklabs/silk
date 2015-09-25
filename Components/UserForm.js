/**
 * Handles user email/password input dialogs.
 */

import React from 'react-native';

let {
  StyleSheet,
  TextInput,
  ActivityIndicatorIOS,
  TouchableOpacity,
  View,
  Text,
} = React;

const loginSpinnerStyles = StyleSheet.create({
  spinner: {
    height: 35,
    alignItems: 'center',
    justifyContent: 'center',
  }
});

class LoginSpinner extends React.Component {
  render() {
    return (
      <View style={loginSpinnerStyles.spinner}>
        <ActivityIndicatorIOS />
      </View>
    );
  }
}

const inputStyles = StyleSheet.create({
  text: {
    fontFamily: 'Open Sans',
    fontSize: 12,
    backgroundColor: 'white',
    borderRadius: 2,
    height: 40,
    marginBottom: 15,
    paddingLeft: 20,
  }
});

class StyledTextInput extends React.Component {
  static defaultProps = {
    secure: false,
    keyboardType: 'default',
    returnKeyType: 'done'
  };

  static propTypes = {
    keyboardType: React.PropTypes.string,
    onChange: React.PropTypes.func,
    onSubmit: React.PropTypes.func,
    placeholder: React.PropTypes.string,
    style: React.PropTypes.object,
    returnKeyType: React.PropTypes.string
  };

  onChangeText = text => {
    if (this.props.onChange) {
      this.props.onChange(text);
    }
  };

  render() {
    return (
      <TextInput
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType={this.props.keyboardType}
        returnKeyType={this.props.returnKeyType}
        placeholder={this.props.placeholder}
        placeholderTextColor="#999999"
        secureTextEntry={this.props.secure}
        onSubmitEditing={this.props.onSubmit}
        style={inputStyles.text}
        onChangeText={this.onChangeText}
      />
    );
  }
}

const buttonStyles = StyleSheet.create({
  button: {
    backgroundColor: '#ff530d',
    height: 35,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 2,
  },
  buttonLabel: {
    fontFamily: 'Open Sans',
    fontSize: 13,
    fontWeight: 'bold',
    color: 'white',
  },
});

class StyledButton extends React.Component {
  static propTypes = {
    label: React.PropTypes.string,
    onClick: React.PropTypes.func,
    style: React.PropTypes.object,
  };

  onPress = () => {
    if (this.props.onClick) {
      this.props.onClick();
    }
  }

  render() {
    return (
        <TouchableOpacity onPress={this.onPress}>
          <View style={buttonStyles.button}>
            <Text style={buttonStyles.buttonLabel}>{this.props.label}</Text>
          </View>
        </TouchableOpacity>
    );
  }
}

export default class UserForm extends React.Component {

  static propTypes = {
    // Explicitly pass through styles...
    style: React.PropTypes.object,

    submitText: React.PropTypes.string,

    /**
     * Should be an async function.
     */
    onSubmit: React.PropTypes.func
  };

  state = {
    submitInProgres: false
  };

  email = ''
  password = ''

  onEmailChange = (email) => {
    this.email = email;
  };

  onPasswordChange = (password) => {
    this.password = password;
  };

  handleSubmit = async () => {
    this.setState({ submitInProgress: true });
    await this.props.onSubmit({
      email: this.email,
      password: this.password
    });
    this.setState({ submitInProgress: false });
  };

  render() {
    let submitOrLoading;
    if (this.state.submitInProgress) {
      submitOrLoading = <LoginSpinner/>;
    } else {
      submitOrLoading = (
        <StyledButton
          label={this.props.submitText}
          onClick={this.handleSubmit}
        />
      );
    }

    return (
      <View style={this.props.style}>
        <StyledTextInput
          placeholder="Email Address"
          keyboardType="email-address"
          onSubmit={this.handleSubmit}
          onChange={this.onEmailChange}
        />
        <StyledTextInput
          placeholder="Password"
          secure={true}
          onSubmit={this.handleSubmit}
          onChange={this.onPasswordChange}
        />
        {submitOrLoading}
        {this.props.children}
      </View>
    );
  }

}
