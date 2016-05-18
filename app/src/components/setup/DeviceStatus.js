import React from 'react';
import { Image, StyleSheet, View } from 'react-native';

import AsyncComponent from '../abstract/AsyncComponent.js';
import Button from '../Button';
import SetupScreen from './SetupScreen';
import { DeviceSession } from '../../libraries/ble/DeviceManager';

const CONNECTION_STATUS_LABELS = {
  'server_disconnected': 'Server disconnected',
  'server_connecting': 'Connecting to server...',
  'server_connected': 'Connected to server',
  'wifi_offline': 'Not connected to WiFi',
  'wifi_disconnected': 'Not connected to WiFi',
  'wifi_scanning': 'Scanning for WiFi networks...',
  'wifi_associating': 'Connecting to WiFi...',
  'wifi_associated': 'Connecting to WiFi...',
  'wifi_authenticating': 'Authenticating with WiFi...',
  'wifi_connected': 'Connected to WiFi',
  'wifi_dhcping': 'Configuring WiFi...',
  'wifi_online': 'Connected to WiFi',
};

export default class DeviceStatus extends AsyncComponent {

  static propTypes = {
    bleDeviceSession: React.PropTypes.instanceOf(DeviceSession).isRequired,
  };

  state = {
    status: null, // see CONNECTION_STATUS_LABELS
    registered: false,
  };

  componentDidMount() {
    const {bleDeviceSession} = this.props;
    bleDeviceSession.on('status', this.onBLEDeviceStatusChange);
    bleDeviceSession.on('dismissed', this.onBLEDeviceRegistered);
  }

  onBLEDeviceStatusChange = (status) => {
    if (!this.state.status !== status.message) {
      this.setStateAsync({status: status.message});
    }
  };

  onBLEDeviceRegistered = () => {
    this.setStateAsync({registered: true});
  };

  componentWillUnmount() {
    const {bleDeviceSession} = this.props;
    bleDeviceSession.removeListener('status', this.onBLEDeviceStatusChange);
    bleDeviceSession.removeListener('dismissed', this.onBLEDeviceRegistered);
  }

  render() {
    let status = CONNECTION_STATUS_LABELS[this.state.status] ||
      'Configuring...';
    if (this.state.registered) {
      status = 'Ready!';
    }
    return (
      <SetupScreen
        title="Setting up your device..."
        subtitle={status}
        primaryButton={
          <Button
            type="primary"
            disabled={!this.state.registered}
            onPress={() => this.props.navigator.popToTopAsync()}
            label="Done"
          />
        }>
        <View style={styles.content}>
          <Image
            source={require('../../assets/hub_large.png')}
            style={styles.hubImage}
          />
        </View>
      </SetupScreen>
    );
  }

}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    marginVertical: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  hubImage: {
    width: 95,
    height: 230,
  },
});
