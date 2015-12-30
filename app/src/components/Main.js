import React from 'react-native';

import Devices from './abstract/Devices';
import ServerConnectivity from './abstract/ServerConnectivity';
import MonitorsView from './MonitorsView';
import NetworkWarning from './NetworkWarning';
import TopBar from './TopBar';

import { shouldPureComponentUpdate } from '../libraries/Util';

const {
  StyleSheet,
  View,
} = React;

class MainView extends React.Component {

  shouldComponentUpdate = shouldPureComponentUpdate;

  render() {
    return (
      <View style={styles.container}>
        <TopBar {...this.props} />
        <NetworkWarning api={this.props.api} />
        <MonitorsView {...this.props} />
      </View>
    );
  }
}

// We can't inline this as a functional component below because that would
// cause `MainView` to be remounted every time `Devices` re-renders.
class MainWithDevices extends React.Component {
  render() {
    return <Devices {...this.props} component={MainView} />;
  }
}

export default class Main extends React.Component {
  render() {
    return (
      <ServerConnectivity
        {...this.props}
        component={MainWithDevices}
      />
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
