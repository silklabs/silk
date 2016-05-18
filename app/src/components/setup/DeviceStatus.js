import React from 'react';
import { Image, StyleSheet, View } from 'react-native';

import AsyncComponent from '../abstract/AsyncComponent.js';
import Button from '../Button';
import SetupScreen from './SetupScreen';
import { DeviceSession } from '../../libraries/ble/DeviceManager';

const CONNECTION_STATUS_LABELS = {
  'server_disconnected': 'server disconnected',
  'server_connecting': 'connecting to server',
  'server_connected': 'connected to server',
  'wifi_offline': 'not connected to WiFi',
  'wifi_disconnected': 'not connected to WiFi',
  'wifi_scanning': 'scanning for WiFi networks',
  'wifi_associating': 'connecting to WiFi',
  'wifi_associated': 'connecting to WiFi',
  'wifi_authenticating': 'authenticating with WiFi',
  'wifi_connected': 'connected to WiFi',
  'wifi_dhcping': 'configuring WiFi',
  'wifi_online': 'connected to WiFi',
};

export default class DeviceStatus extends AsyncComponent {

  static propTypes = {
    bleDeviceSession: React.PropTypes.instanceOf(DeviceSession).isRequired,
    onCancel: React.PropTypes.func.isRequired,
  };

  state = {
    status: null, // see CONNECTION_STATUS_LABELS
  };

  componentDidMount() {
    this.props.bleDeviceSession.on('status', this.onBLEDeviceStatusChange);
  }

  onBLEDeviceStatusChange = (status) => {
    if (!this.state.status !== status.message) {
      this.setStateAsync({status: status.message});
    }
  };

  componentWillUnmount() {
    this.props.bleDeviceSession.removeListener('status', this.onBLEDeviceStatusChange);
  }

  render() {
    return (
      <SetupScreen
        title="Setting up your device..."
        subtitle={CONNECTION_STATUS_LABELS[this.state.status] || this.state.status}
        secondaryButton={
          <Button
            type="secondary"
            onPress={this.props.onCancel}
            label="Cancel"
          />
        }>
        <View style={styles.content}>
          <Image
            source={require('image!hub_large')}
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
    justifyContent: 'center',
    alignItems: 'center',
  },
  hubImage: {
    width: 95,
    height: 230,
    marginVertical: 24,
  },
});
