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

export default class Main extends React.Component {
  render() {
    return (
      <ServerConnectivity
        {...this.props}
        component={(props) => <Devices {...props} component={MainView} />}
      />
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
