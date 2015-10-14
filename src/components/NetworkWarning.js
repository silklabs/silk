import React from 'react-native';
let {
  NetInfo,
  View,
  StyleSheet,
  Text,
} = React;

/**
 * Autonomous component that detects when there's no network availability and
 * displays a warning box.
 */
export default class NetworkWarning extends React.Component {

  state = {
    hasNetwork: true,
  };

  componentWillMount() {
    NetInfo.isConnected.fetch().then(this.onConnectivityChange);
    NetInfo.isConnected.addEventListener('change', this.onConnectivityChange);
  }

  componentWillUnmount() {
    NetInfo.isConnected.removeEventListener('change', this.onConnectivityChange);
  }

  onConnectivityChange = (hasNetwork) => {
    this.setState({hasNetwork});
  };

  render() {
    if (this.state.hasNetwork) {
      return <View />;
    }
    return (
      <View style={styles.warningBox}>
        <Text style={styles.warningHeading}>
          Network Connection Unavailable
        </Text>
        <Text style={styles.warningText}>
          Please check your data or WiFi connection.
        </Text>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  warningBox: {
    backgroundColor: '#c30016',
    padding: 8,
  },
  warningHeading: {
    fontSize: 17,
    fontWeight: '500',
    color: 'white',
  },
  warningText: {
    color: 'white',
    marginTop: 2,
  },
});
