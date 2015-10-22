import React from 'react-native';
import createLog from 'log';

import Config from '../../libraries/Config';
import { UserState } from '../../libraries/UserState';

import AsyncComponent from '../AsyncComponent';
import AuthForm from './AuthForm';
import Button from './Button';
import NetworkWarning from '../NetworkWarning';
import TextLink from './TextLink';
import { WordMarkText } from '../Text';

const log = createLog('NotLoggedIn');

let {
  AlertIOS,
  DeviceEventEmitter,
  Navigator,
  ScrollView,
  StyleSheet,
  View,
} = React;

const DEVELOPER_CREDENTIALS = {};

export default class extends AsyncComponent {

  static propTypes = {
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
    let devAccountButton = null;
    let serverPickerButton = null;
    let { allowDevAccount, showServerPicker } = Config.get().preferences;
    if (allowDevAccount) {
      devAccountButton = (
        <Button
          label="Run As Developer"
          secondary={true}
          inProgress={this.state.inProgress}
          onPress={() => this._signIn(DEVELOPER_CREDENTIALS)}
        />
      );
    }
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
        {devAccountButton}
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
          submitText="Sign In"
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
    let { userState } = this.props;
    this.setStateAsync({ inProgress: true });
    try {
      let success = false;
      if (credentials === DEVELOPER_CREDENTIALS) {
        success = await userState.attemptDeveloperLogin();
      } else {
        success = await userState.attemptSignIn(credentials.email, credentials.password);
      }
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

  _renderControls() {
    switch (this.state.controls) {
      case 'signup':
        return this._renderSignUp();
      case 'signin':
        return this._renderSignIn();
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
        scrollable={false}>
        <View style={styles.statusBar} />
        <NetworkWarning />
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
