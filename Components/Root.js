/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

import React from 'react-native';

let {
  AppRegistry,
  StyleSheet,
  Text,
  View,
} = React;

// Include our own browser shim goop but after react-native has loaded for the
// first time and created it's own shims.
import '../Libraries/BrowserShims';

import Config from '../Libraries/Config';
import API from 'silk-api-react-native';
import AsyncComponent from './AsyncComponent';
import AsyncNavigator from './AsyncNavigator';
import TabsView from './TabsView';
import SignIn from './SignIn';
import SignUp from './SignUp';
import WifiSettings from './WifiSettings';
import UserState from '../Libraries/UserState';

const routeToComponentMap = {
  SignIn,
  SignUp,
  Tabs: TabsView,
  WifiSettings,
};

class Silk extends AsyncComponent {

  state = {
    serverUrl: null,
    initialRoute: null,
    api: null,
    userState: null,
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
      await this.state.userState.signOut();
    }

    let api = API({serverUrl}); /* eslint new-cap: 0 */
    let userState = new UserState(api);
    let loggedIn = await userState.getAccessToken();
    let initialRoute = loggedIn ? 'Tabs' : 'SignIn';
    this.setStateAsync({serverUrl, initialRoute, api, userState});
  };

  render() {
    // Do not create a navigator until we have loaded initial state from
    // disk... That process is fast enough that we do not need to do do any
    // loading/splash screen.
    if (!this.state.initialRoute) {
      return <View />;
    }

    return (
      <AsyncNavigator
        // By keying the Navigator on the serverUrl, a change will
        // trigger a complete re-render of the app.
        key={this.state.serverUrl}
        initialRoute={{name: this.state.initialRoute, index: 0}}
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

AppRegistry.registerComponent('Silk', () => Silk);
