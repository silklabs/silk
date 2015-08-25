/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

import React from 'react-native';

import LinearGradient from 'react-native-linear-gradient';

let {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} = React;

class Spacer extends React.Component {
  render() {
    return (<View style={{ flex: 1 }} />);
  }
}

class LogoView extends React.Component {
  render() {
    return (
      <View style={styles.logoEltsContainer}>
        <Spacer />
        <View style={styles.logo}/>
        <View style={styles.markContainer}>
          <Text style={styles.silkText}>SILK</Text>
          <Text style={styles.labsText}>LABS</Text>
        </View>
      </View>
    );
  }
};

class StyledTextInput extends React.Component {
  static defaultProps = {
    secure: false,
  };

  static propTypes = {
    onChange: React.PropTypes.func,
    placeholder: React.PropTypes.string,
    style: React.PropTypes.object,
  };

  onChangeText(text) {
    if (this.props.onChange) {
      this.props.onChange(text);
    }
  }

  render() {
    return (
        <TextInput autoCapitalize='none'
                   autoCorrect={false}
                   placeholder={this.props.placeholder}
                   placeholderTextColor={'#999999'}
                   secureTextEntry={this.props.secure}
                   style={styles.textInput}
      onChangeText={this.onChangeText.bind(this)} />
    );
  }
};

class StyledButton extends React.Component {
  static propTypes = {
    label: React.PropTypes.string,
    onClick: React.PropTypes.func,
    style: React.PropTypes.object,
  };

  onPress() {
    if (this.props.onClick) {
      this.props.onClick();
    }
  }
  
  render() {
    return (
        <TouchableOpacity onPress={this.onPress.bind(this)}>
          <View style={styles.button}>
            <Spacer />
            <Text style={styles.buttonLabel}>{this.props.label}</Text>
            <Spacer />
          </View>
        </TouchableOpacity>
    );
  }
};

class TextLink extends React.Component {
  static propTypes = {
    label: React.PropTypes.string,
    onClick: React.PropTypes.func,
    style: React.PropTypes.object,
  };

  onPress() {
    if (this.props.onClick) {
      this.props.onClick();
    }
  }

  render() {
    return (
        <TouchableOpacity onPress={this.onPress.bind(this)}>
          <View style={styles.link}>
            <Text style={styles.linkLabel}>{this.props.label}</Text>
          </View>
        </TouchableOpacity>
    );
  }
};

class SignInControls extends React.Component {
  onEmailChange(text) {
    console.log('Email changed to', text);
  }

  onPasswordChange(text) {
    console.log('Password changed to [redacted]', text.length);
  }

  onSignIn() {
    // TODO: proper sign-in flow
    this.props.navigator.push({ name: 'Monitors', index: 0 });
  }

  onSignUp() {
    console.log('Sign Up');
  }

  onLearnMore() {
    console.log('Learn More');
  }

  render() {
    return (
      <View style={styles.signInContainer}>
        <StyledTextInput placeholder='Email Address'
                         onChange={this.onEmailChange.bind(this)} />
        <StyledTextInput placeholder='Password'
                         secure={true}
                         onChange={this.onPasswordChange.bind(this)} />
        <StyledButton label='SIGN IN'
                      onClick={this.onSignIn.bind(this)} />
        <View style={styles.bottomLinks}>
          <Spacer />
          <View style={styles.linksRow}>
            <TextLink label='SIGN UP'
                      onClick={this.onSignUp} />
            <Spacer />
            <TextLink label='LEARN MORE'
                      onClick={this.onLearnMore}/>
          </View>
        </View>
      </View>
    );
  }
}

export default class extends React.Component {
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
            <SignInControls navigator={this.props.navigator} />
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
    alignItems: 'center',
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
  markContainer: {
    flexDirection: 'row',
    margin: 10,
  },
  silkText: {
    fontFamily: 'Open Sans',
    fontSize: 18,
    fontWeight: '900',
    color: 'white',
  },
  labsText: {
    fontFamily: 'Open Sans',
    fontSize: 18,
    color: 'white',
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
  textInput: {
    fontFamily: 'Open Sans',
    fontSize: 12,
    backgroundColor: 'white',
    borderRadius: 2,
    height: 40,
    marginBottom: 15,
    paddingLeft: 20,
  },
  button: {
    backgroundColor: '#ff530d',
    height: 35,
    alignItems: 'center',
    borderRadius: 2,
  },
  buttonLabel: {
    fontFamily: 'Open Sans',
    fontSize: 13,
    fontWeight: 'bold',
    color: 'white',
  },
  bottomLinks: {
    flex: 1,
  },
  linksRow: {
    flex: 1,
    flexDirection: 'row',
  },
  link: {
    margin: 10,
  },
  linkLabel: {
    fontFamily: 'Open Sans',
    fontSize: 10,
    fontWeight: 'bold',
    color: '#99a0a4',
  },
});
