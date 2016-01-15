import CrashReporter from '../libraries/CrashReporter';
CrashReporter.start();

import React from 'react-native';
let {
  NetInfo,
  StyleSheet,
  Text,
  View,
} = React;

// Include our own browser shim goop but after react-native has loaded for the
// first time and created it's own shims.
import '../libraries/BrowserShims';
import '../libraries/CryptoSign';
import Config from '../libraries/Config';
import { getRandomBytes } from '../libraries/Crypto';
import loadUserState from '../libraries/UserState';

import createLog from 'silk-log';
import createAPI from 'silk-api';
import version from 'silk-core-version';

import AsyncComponent from './abstract/AsyncComponent';
import AsyncNavigator from './abstract/AsyncNavigator';
import DeviceConfig from './setup/DeviceConfig';
import DeviceTouch from './setup/DeviceTouch';
import Main from './Main';
import NotLoggedIn from './auth/NotLoggedIn';
import ServerPicker from './auth/ServerPicker';
import Settings from './Settings';

const log = createLog('Root');

const routeToComponentMap = {
  NotLoggedIn,
  ServerPicker,
  Main,
  Settings,
  DeviceTouch,
  DeviceConfig,
};

export default class Root extends AsyncComponent {

  state = {
    initialized: false,
    serverUrl: null,
    api: null,
    userState: null,
    accessToken: null,
  };

  componentDidMount() {
    Config.init();
    Config.on('change', this.onConfigChange);
    log.info(`silk-core ${version.semver} (${version.sha})`);
  }

  onConfigChange = async (config) => {
    let serverUrl = config.serverUrl;
    if (serverUrl === null || serverUrl === undefined) {
      // Default to the first entry in server.choices
      let { choices } = Config.get().server;
      serverUrl = choices[0].value;
      log.info('Selecting default server:', serverUrl);
      Config.set({serverUrl});
      return; // Wait for the next 'change' event to continue processing
    }

    let { userState } = this.pendingState;
    if (userState !== null) {
      userState.removeListener('authenticated', this.onAuthenticated);
      userState.removeListener('unauthenticated', this.onUnauthenticated);
    }

    let apiOptions = {getRandomBytes};
    if (serverUrl !== '' /* use API default server */) {
      apiOptions.serverUrl = serverUrl;
    }

    let api = createAPI(apiOptions);

    // Hook up metrics to network state. This will give the metrics agent a kick
    // each time network state changes (offline/online).
    NetInfo.isConnected.addEventListener(
      'change',
      api.accountMetrics.onConnectivityChange
    );

    userState = await loadUserState(api);

    // If we already are logged in immediately start metrics agent.
    if (userState.accessToken) {
      api.accountMetrics.start();
    }

    userState.on('authenticated', this.onAuthenticated);
    userState.on('unauthenticated', this.onUnauthenticated);
    this.setStateAsync({
      initialized: true,
      serverUrl,
      api,
      userState,
      accessToken: userState.accessToken,
    });
  };

  onAuthenticated = (accessToken) => {
    this.setStateAsync({accessToken});
    this.state.api.accountMetrics.start();
  };

  onUnauthenticated = () => {
    this.setStateAsync({accessToken: null});
    this.state.api.accountMetrics.stop();
  };

  render() {
    // Do not create a navigator until we have loaded initial state from
    // disk... That process is fast enough that we do not need to do do any
    // loading/splash screen.
    if (!this.state.initialized) {
      return <View />;
    }

    let initialRoute = this.state.accessToken ? 'Main' : 'NotLoggedIn';
    // By keying the navigator on the serverUrl and accessToken, a
    // change in either (e.g. logging in or changing the server
    // config) will trigger a complete re-render of the app.
    let key = this.state.serverUrl + ':' + this.state.accessToken;
    return (
      <AsyncNavigator
        key={key}
        initialRoute={{name: initialRoute, index: 0}}
        onForward={this.onForward}
        configureScene={this.configureScene}
        renderScene={this.renderScene}
        style={styles.container}
      />
    );
  }

  renderScene = (route, navigator) => {
    let Component = routeToComponentMap[route.name];
    if (!Component) {
      return (
        <View style={{flex: 1, backgroundColor: 'red', paddingTop: 32}}>
          <Text style={{color: 'yellow', fontSize: 30}}>
            Unknown scene {route.name}
          </Text>
        </View>
      );
    }
    let props = {
      api: this.state.api,
      userState: this.state.userState,
      navigator,
      route,
    };
    return <Component {...props} {...route.props} />;
  };

  onForward() {
    // --> Settings
  }

  configureScene(route) {
    switch (route.name) {
    case 'Settings':
    case 'ServerPicker':
    case 'DeviceTouch':
      return AsyncNavigator.SceneConfigs.FloatFromBottom;
    default:
      return AsyncNavigator.SceneConfigs.PushFromRight;
    }
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'white',
  },
});
