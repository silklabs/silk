/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

import React from 'react-native';
let {
  StyleSheet,
  Text,
  View,
} = React;

// Include our own browser shim goop but after react-native has loaded for the
// first time and created it's own shims.
import '../libraries/BrowserShims';
import Config from '../libraries/Config';
import UserState from '../libraries/UserState';

import API from 'silk-api-react-native';

import AsyncComponent from './AsyncComponent';
import AsyncNavigator from './AsyncNavigator';
import TabsView from './TabsView';
import SignIn from './SignIn';
import SignUp from './SignUp';
import WifiSettings from './WifiSettings';

const routeToComponentMap = {
  SignIn,
  SignUp,
  Tabs: TabsView,
  WifiSettings,
};

export default class extends AsyncComponent {

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
  }

  onConfigChange = async (config) => {
    let serverUrl = config.server.url;
    if (serverUrl === null) {
      serverUrl = Config.getDefault().server.url;
    }

    if (this.state.serverUrl !== serverUrl && this.state.userState !== null) {
      let { userState } = this.state;
      await userState.signOut();
      userState.off('authenticated', this.onAuthenticated);
      userState.off('unauthenticated', this.onUnauthenticated);
    }

    let api = API({serverUrl}); /* eslint new-cap: 0 */
    let userState = new UserState(api);
    let accessToken = await userState.getAccessToken();

    userState.on('authenticated', this.onAuthenticated);
    userState.on('unauthenticated', this.onUnauthenticated);
    this.setStateAsync({
      initialized: true,
      serverUrl,
      api,
      userState,
      accessToken,
    });
  };

  onAuthenticated = (accessToken) => {
    this.setState({accessToken});
  };

  onUnauthenticated = () => {
    this.setState({accessToken: null});
  };

  render() {
    // Do not create a navigator until we have loaded initial state from
    // disk... That process is fast enough that we do not need to do do any
    // loading/splash screen.
    if (!this.state.initialized) {
      return <View />;
    }

    let initialRoute = this.state.accessToken ? 'Tabs' : 'SignIn';
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
    return <Component {...props} />;
  };

  onForward() {
    // --> Settings
  }

  configureScene(route) {
    switch (route.name) {
    case 'WifiSettings':
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
