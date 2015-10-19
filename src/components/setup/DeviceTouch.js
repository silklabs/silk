import React from 'react-native';
let {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} = React;

import ProximityMeter from './ProximityMeter';
import { LayoutStyles, TitleBarStyles } from '../CommonStyles';

import DeviceManager from '../../libraries/btle/DeviceManager';

export default class DeviceTouch extends React.Component {

  static propTypes = {
    bleDeviceManager: React.PropTypes.instanceOf(DeviceManager).isRequired,
  };

  state = {
    rssi: -100,
  };

  componentWillMount() {
    this.props.bleDeviceManager.on('rssi', this.onRSSI);
  }

  componentWillUnmount() {
    this.props.bleDeviceManager.removeListener('rssi', this.onRSSI);
  }

  onRSSI = (peripheral) => {
    if (peripheral.deviceId !== this.props.deviceId) {
      return;
    }
    this.setState({rssi: peripheral.rssi});
  };

  render() {
    return (
      <View style={styles.container}>
        <View style={LayoutStyles.statusBarPlaceholder} />
        <View style={TitleBarStyles.titleBar}>
          <TouchableOpacity
            onPress={this._handleCancel}
            style={TitleBarStyles.titleBarLeftButton}>
            <Text style={TitleBarStyles.titleBarButtonLabel}>Cancel</Text>
          </TouchableOpacity>
          <Text style={TitleBarStyles.titleBarLabel}>Device Setup</Text>
        </View>
        <View style={styles.contentContainer}>
          <Text style={styles.label}>Touch the device with your phone.</Text>
          <ProximityMeter rssi={this.state.rssi} />
        </View>
      </View>
    );
  }

  _handleCancel = () => {
    this.props.navigator.popToTop();
  };

}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'white',
  },
  contentContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 17,
    margin: 25,
  },
});
