/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

import React from 'react-native';

let {
  AppRegistry,
  Navigator,
  StyleSheet,
  Text,
  View,
} = React;

// Include our own browser shim goop but after react-native has loaded for the
// first time and created it's own shims.
import '../Libraries/BrowserShims';

import Config from '../Libraries/Config';
import TabsView from './TabsView';
import SignIn from './SignIn';
import SignUp from './SignUp';
import WifiSettings from './WifiSettings';
import UserState from '../Libraries/UserState';

// global instance of the silk api
const api = require('silk-api-react-native')({
  serverUrl: Config.server.url,
});

// global instance of user state.
const userState = new UserState(api);

const routeToComponentMap = {
  SignIn,
  SignUp,
  Tabs: TabsView,
  WifiSettings,
};

class Silk extends React.Component {

  state = {
    initialRoute: null,
  };

  async componentDidMount() {
    // If a token is set great then skip login screen...
    let loggedIn = await userState.getAccessToken();
    if (loggedIn) {
      this.setState({ initialRoute: 'Tabs' });
    } else {
      this.setState({ initialRoute: 'SignIn' });
    }
  }

  render() {
    // Do not create a navigator until we have loaded initial state from
    // disk... That process is fast enough that we do not need to do do any
    // loading/splash screen.
    if (!this.state.initialRoute) {
      return <View />;
    }

    return (
      <Navigator
        initialRoute={{name: this.state.initialRoute, index: 0}}
        onForward={this.onForward}
        configureScene={this.configureScene}
        renderScene={this.renderScene}
        style={styles.container}
      />
    );
  }

  renderScene(route, navigator) {
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
      api,
      userState,
      navigator,
      route,
    };
    return <Component {...props} />;
  }

  onForward() {
    // --> Settings
  }

  configureScene(route) {
    switch (route.name) {
    case 'WifiSettings':
      return Navigator.SceneConfigs.FloatFromBottom;
    default:
      return Navigator.SceneConfigs.PushFromRight;
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
