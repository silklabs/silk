import React from 'react-native';
let {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} = React;

import ProximityMeter from './ProximityMeter';
import { LayoutStyles, TitleBarStyles } from '../CommonStyles';

import { DeviceSession } from '../../libraries/btle/DeviceManager';

const RSSI_CLOSE = -50;
const RSSI_NEAR = -60;
const RSSI_FAR = -70;

const AFTER_TOUCH_WAIT_MS = 500;

export default class DeviceTouch extends React.Component {

  static propTypes = {
    bleDeviceSession: React.PropTypes.instanceOf(DeviceSession).isRequired,
    onCancel: React.PropTypes.func.isRequired,
    onSave: React.PropTypes.func.isRequired,
  };

  state = {
    proximity: 0,
    touched: false,
    deviceSecret: null,
  };

  mounted = false;

  componentWillMount() {
    this.mounted = true;
    let { bleDeviceSession } = this.props;
    bleDeviceSession.on('rssiUpdate', this._onRSSI);
    bleDeviceSession.on('secret', this._onDeviceTouch);
  }

  componentWillUnmount() {
    this.mounted = false;
    let { bleDeviceSession } = this.props;
    bleDeviceSession.removeListener('rssiUpdate', this._onRSSI);
    bleDeviceSession.removeListener('secret', this._onDeviceTouch);
  }

  _onDeviceTouch = (deviceSecret) => {
    let { bleDeviceSession } = this.props;
    bleDeviceSession.removeListener('rssiUpdate', this._onRSSI);
    bleDeviceSession.removeListener('secret', this._onDeviceTouch);
    if (!this.mounted) {
      return;
    }

    this.setState({
      deviceSecret,
      touched: true,
      proximity: 3,
    });
    setTimeout(() => {
      if (!this.mounted) {
        return;
      }
      this.props.navigator.push({
        name: 'DeviceConfig',
        props: {
          ...this.props,
          deviceSecret: this.state.deviceSecret,
        },
      });
    }, AFTER_TOUCH_WAIT_MS);
  };

  _onRSSI = (rssi) => {
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
