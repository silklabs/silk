import React from 'react-native';
import createLog from 'log';
import { SilkApi } from 'silk-api';

import Config from '../../libraries/Config';
import { UserState } from '../../libraries/UserState';

import AsyncComponent from '../abstract/AsyncComponent';
import AuthForm from './AuthForm';
import Button from './Button';
import NetworkWarning from '../NetworkWarning';
import TextLink from './TextLink';
import { WordMarkText } from '../Text';

const log = createLog('NotLoggedIn');

const {
  AlertIOS,
  DeviceEventEmitter,
  Navigator,
  ScrollView,
  StyleSheet,
  View,
} = React;

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

  onKeyboardShow = (event) => {
    this.setState({
      keyboardShown: true,
      contentInsetBottom: event.endCoordinates.height,
    });
  };

  onKeyboardHide = (event) => {
    this.setState({
      keyboardShown: false,
      contentInsetBottom: 0,
    });
  };

  _renderLogo() {
    if (this.state.keyboardShown) {
      return null;
    }
    return (
      <View style={styles.logoContainer}>
        <View style={styles.logoEltsContainer}>
          <View style={styles.logo}/>
          <WordMarkText />
        </View>
      </View>
   );
  }

  _renderFirstScreen() {
    let serverPickerButton = null;
    let { showServerPicker } = Config.get().preferences;
    if (showServerPicker) {
      serverPickerButton = (
        <Button
          label="Change Server"
          secondary={true}
          onPress={() => this.props.navigator.push({name: 'ServerPicker'})}
        />
      );
    }
    return (
      <View style={styles.controlsContainer}>
        <Button
          label="Create An Account"
          onPress={() => this.setState({controls: 'signup'})}
        />
        <Button
          label="I Already Have An Account"
          onPress={() => this.setState({controls: 'signin'})}
        />
        {serverPickerButton}
        <View style={styles.bottomLinks}>
          <TextLink
            label="LEARN MORE"
            onPress={() => console.log('Learn more')}
          />
          <TextLink
            label="TERMS & CONDITIONS"
            onPress={() => console.log('T&C')}
          />
        </View>
      </View>
    );
  }

  _renderSignUp() {
    return (
      <View style={styles.controlsContainer}>
        <AuthForm
          onSubmit={this._signUp}
          inProgress={this.state.inProgress}
          password={true}
          verifyPassword={true}
          submitText="Sign Up"
        />
        <View style={styles.bottomLinks}>
          <TextLink
            label="BACK"
            onPress={() => this.setState({controls: null})}
          />
        </View>
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
    AlertIOS.alert(
      'Error',
      'Something went wrong. Please try again.'
    );
    this.setStateAsync({ inProgress: false });
  };

  _renderSignIn() {
    return (
      <View style={styles.controlsContainer}>
        <AuthForm
          onSubmit={this._signIn}
          inProgress={this.state.inProgress}
          password={true}
          verifyPassword={false}
          submitText="Sign In"
        />
        <View style={styles.bottomLinks}>
          <TextLink
            label="BACK"
            onPress={() => this.setState({controls: null})}
          />
          <TextLink
            label="FORGOT PASSWORD?"
            onPress={() => this.setState({controls: 'forgot_password'})}
          />
        </View>
      </View>
    );
  }

  _renderForgotPassword() {
    return (
      <View style={styles.controlsContainer}>
        <AuthForm
          onSubmit={this._forgotPassword}
          inProgress={this.state.inProgress}
          submitText="Reset Password"
          password={false}
          verifyPassword={false}
        />
        <View style={styles.bottomLinks}>
          <TextLink
            label="BACK"
            onPress={() => this.setState({controls: null})}
          />
        </View>
      </View>
    );
  }

  _signIn = async (credentials) => {
    const { userState } = this.props;
    this.setStateAsync({ inProgress: true });
    try {
      const success = await userState.attemptSignIn(credentials.email, credentials.password);
      if (success) {
        return;
      }
      AlertIOS.alert(
        'Error',
        'Invalid username or password. Please try again'
      );
    } catch (err) {
      log.info('Failed to sign in', err);
      AlertIOS.alert(
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
      AlertIOS.alert(title, message);
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
    return (
      <ScrollView
        contentContainerStyle={[styles.container, extraStyle]}
        keyboardShouldPersistTaps={false}
        alwaysBounceVertical={false}
        scrollable={false}>
        <View style={styles.statusBar} />
        <NetworkWarning api={this.props.api} />
        <View style={styles.container}>
          {this._renderLogo()}
          {this._renderControls()}
        </View>
      </ScrollView>
    );
  }

}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#dfdfdf',
  },

  statusBar: {
    height: Navigator.NavigationBar.Styles.General.StatusBarHeight,
    backgroundColor: '#dfdfdf',
  },

  logoContainer: {
    flex: 1,
  },
  logoEltsContainer: {
    flex: 1,
    alignSelf: 'center',
    justifyContent: 'flex-end',
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

  controlsContainer: {
    flex: 1,
    paddingHorizontal: 32,
    paddingBottom: 16,
    justifyContent: 'flex-end',
  },

  controls: {
  },

  bottomLinks: {
    paddingTop: 8,
    alignItems: 'center',
    justifyContent: 'space-between',
    flexDirection: 'row',
  },
});
