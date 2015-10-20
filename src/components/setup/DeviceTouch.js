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

const RSSI_CLOSE = -50;
const RSSI_NEAR = -60;
const RSSI_FAR = -70;

export default class DeviceTouch extends React.Component {

  static propTypes = {
    bleDeviceManager: React.PropTypes.instanceOf(DeviceManager).isRequired,
    deviceId: React.PropTypes.string.isRequired,
    onCancel: React.PropTypes.func.isRequired,
  };

  state = {
    proximity: 0,
    touched: false,
  };

  componentWillMount() {
    this.props.bleDeviceManager.on('rssi', this._onRSSI);
  }

  componentWillUnmount() {
    this.props.bleDeviceManager.removeListener('rssi', this._onRSSI);
  }

  _onRSSI = (peripheral) => {
    if (this.state.touched || peripheral.deviceId !== this.props.deviceId) {
      return;
    }
    let { rssi } = peripheral;
    let proximity = 0;
    if (rssi > RSSI_CLOSE) {
      proximity = 3;
    } else if (rssi > RSSI_NEAR) {
      proximity = 2;
    } else if (rssi > RSSI_FAR) {
      proximity = 1;
    }
    if (proximity !== this.state.proximity) {
      this.setState({proximity});
    }
  };

  onDeviceTouch = () => {
    this.setState({
      touched: true,
      proximity: 3,
    });
  };

  render() {
    let label;
    if (this.state.touched) {
      label = 'Success! Let\'s configure your new device!';
    } else {
      label = 'Touch the device with your phone.';
    }
    return (
      <View style={styles.container}>
        <View style={LayoutStyles.statusBarPlaceholder} />
        <View style={TitleBarStyles.titleBar}>
          <TouchableOpacity
            onPress={this.props.onCancel}
            style={TitleBarStyles.titleBarLeftButton}>
            <Text style={TitleBarStyles.titleBarButtonLabel}>Cancel</Text>
          </TouchableOpacity>
          <Text style={TitleBarStyles.titleBarLabel}>Device Setup</Text>
        </View>
        <View style={styles.contentContainer}>
          <Text style={styles.label}>{label}</Text>
          <ProximityMeter proximity={this.state.proximity} />
        </View>
      </View>
    );
  }

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
    fontSize: 20,
    marginHorizontal: 25,
    marginVertical: 50,
    textAlign: 'center',
  },
});
