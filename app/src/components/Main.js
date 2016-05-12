import React from 'react';
import PureRenderMixin from 'react-addons-pure-render-mixin';
import { Navigator, StyleSheet, View } from 'react-native';

import Devices from './abstract/Devices';
import DeviceList from './DeviceList';
import NetworkWarning from './NetworkWarning';
import ServerConnectivity from './abstract/ServerConnectivity';
import TopBar from './TopBar';

class MainView extends React.Component {

  shouldComponentUpdate = PureRenderMixin.shouldComponentUpdate;

  render() {
    return (
      <View style={styles.container}>
        <TopBar {...this.props} />
        <View style={styles.content}>
          <NetworkWarning api={this.props.api} />
          <DeviceList {...this.props} />
        </View>
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
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  content: {
    position: 'absolute',
    top: Navigator.NavigationBar.Styles.General.TotalNavHeight,
    left: 0,
    right: 0,
    bottom: 0,
  },
});
