/**
 * @flow
 */

import invariant from 'assert';
import React from 'react';
import {
  Alert,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {lockToPortrait} from 'react-native-orientation';
import {connect, Provider} from 'react-redux';
import {client} from 'silk-app-client';
import version from 'silk-core-version';
import createLog from 'silk-log';

import defaultConfig from '../libraries/config';
import createStore from '../store';
import * as actions from '../store/actions';

import AsyncComponent from './abstract/AsyncComponent';
import AsyncNavigator from './abstract/AsyncNavigator';
import CameraLiveVideo from './CameraLiveVideo';
import DeviceStatus from './setup/DeviceStatus';
import DeviceTouch from './setup/DeviceTouch';
import WifiConfig from './setup/WifiConfig';
import Main from './Main';
import NotLoggedIn from './auth/NotLoggedIn';
import ServerPicker from './auth/ServerPicker';
import Settings from './Settings';

import type {Dispatch} from 'silk-redux/action';
import type {AppState, AppStore} from '../store';

export type Route = {
  name: string;
  index: number;
  props?: {[name: string]: any};
};

type Navigator = any; // TODO: try to do better here

export type GlobalProps = AppState & {
  route: Route;
  navigator: Navigator;
  store: AppStore;
  dispatch: Dispatch<*>;
};

const log = createLog('Root');

const routeToComponentMap = {
  NotLoggedIn,
  ServerPicker,
  Main,
  Settings,
  CameraLiveVideo,
  DeviceTouch,
  WifiConfig,
  DeviceStatus,
};

// Wrap each component so it's connected to the store.
const connectToState = connect((state) => state);

for (let componentName in routeToComponentMap) {
  const Component = routeToComponentMap[componentName];
  routeToComponentMap[componentName] = connectToState(Component);
}

const store = createStore();
client.init(store);

const AFTER_TOUCH_WAIT_MS = 250;

class Root extends AsyncComponent {

  props: AppState;
  _unsubscribers: Array<Function> = [];

  componentWillMount() {
    if (Platform.OS === 'ios') {
      lockToPortrait();
    }
  }

  componentDidMount() {
    log.info(`silk-core ${version.semver} (${version.sha})`);
    store.dispatch(actions.config.setDefault(defaultConfig));
    store.dispatch(actions.config.restoreUser());

    // Navigation logic for the setup flow:

    store.subscribeToPath('devices.configuring', (configuring, previous) => {
      if (!previous && configuring) {
        this.refs.navigator.pushAsync({name: 'DeviceTouch'});
      } else if (previous && !configuring) {
        this.refs.navigator.popToTopAsync();
      }
    });
    store.subscribeToPath('devices.configuring.secret', (secret) => {
      if (secret) {
        setTimeout(
          () => this.refs.navigator.replaceAsync({name: 'WifiConfig'}),
          AFTER_TOUCH_WAIT_MS
        );
      }
    });
    store.subscribeToPath('devices.configuring.config', (config) => {
      if (config) {
        this.refs.navigator.replaceAsync({name: 'DeviceStatus'});
      }
    });
    store.subscribeToPath('devices.configuring.error', (error) => {
      if (error) {
        Alert.alert(
          'Error Configuring Device',
          error.message,
          [{text: 'Ok', onPress: () => store.dispatch(actions.devices.config.finish())}]
        );
      }
    });
  }

  render() {
    // Do not create a navigator until we have loaded initial state from
    // disk... That process is fast enough that we do not need to do do any
    // loading/splash screen.
    if (!this.props.auth.restoreAttempted) {
      return <View />;
    }

    const {isAuthenticated} = this.props.auth;
    const initialRoute = isAuthenticated ? 'Main' : 'NotLoggedIn';

    // By keying the navigator on the serverUrl and accessToken, a
    // change in either (e.g. logging in or changing the server
    // config) will trigger a complete re-render of the app.
    invariant(this.props.config.current);
    invariant(this.props.api);
    const {accessToken} = this.props.api;
    const serverUrl = this.props.config.current.serverUrl || '';
    const accessTokenString = accessToken ? accessToken.toString() : '';
    const key = [serverUrl, isAuthenticated, accessTokenString].join(':');

    return (
      <AsyncNavigator
        key={key}
        ref="navigator"
        initialRoute={{name: initialRoute, index: 0}}
        onForward={this.onForward}
        configureScene={this.configureScene}
        renderScene={this.renderScene}
        style={styles.container}
      />
    );
  }

  renderScene: (route: Route, navigator: Navigator) => React$Element<any>
    = this.renderScene.bind(this);

  renderScene(route: Route, navigator: Navigator): React$Element<any> {
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
      store,
      navigator,
      route,
    };
    return (
      <Provider store={store}>
        <Component {...props} {...route.props} />
      </Provider>
    );
  }

  onForward() {
    // --> Settings
  }

  configureScene(route: Route) {
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
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'white',
  },
});

const RootWithState = connectToState(Root);

export default class RootProvider extends React.Component {

  render() {
    return (
      <Provider store={store}>
        <RootWithState {...this.props} />
      </Provider>
    );
  }

}
