import React from 'react-native';

import Devices from './abstract/Devices';
import ServerConnectivity from './abstract/ServerConnectivity';
import MonitorsView from './MonitorsView';
import NetworkWarning from './NetworkWarning';
import TopBar from './TopBar';

const {
  StyleSheet,
  View,
} = React;

class MainView extends React.Component {
  render() {
    return (
      <View style={styles.container}>
        <TopBar {...this.props} />
        <NetworkWarning api={this.props.api} />
        <MonitorsView
          {...this.state}
          {...this.props}
        />
      </View>
    );
  }
}

// TODO: once we're on RN 0.16+, this could just be inlined as
//   (props) => <Devices {...props} component={MainView} />
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
