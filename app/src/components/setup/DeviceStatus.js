/**
 * @flow
 */

import React from 'react';
import {Image, StyleSheet, View} from 'react-native';

import * as actions from '../../store/actions';
import AsyncComponent from '../abstract/AsyncComponent.js';
import Button from '../Button';
import SetupScreen from './SetupScreen';

import type {GlobalProps} from '../Root';

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

  props: GlobalProps;

  render() {
    const {configuring} = this.props.devices;
    let label = 'Configuring';
    if (configuring &&
        configuring.status &&
        configuring.status.message in CONNECTION_STATUS_LABELS) {
      label = CONNECTION_STATUS_LABELS[configuring.status.message];
    }
    if (!configuring || configuring.registered) {
      label = 'Ready!';
    }
    return (
      <SetupScreen
        title="Setting up your device..."
        subtitle={label}
        primaryButton={
          <Button
            type="primary"
            disabled={configuring && !configuring.registered}
            onPress={this._onDone}
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

  _onDone = () => {
    this.props.dispatch(actions.devices.config.finish());
  };

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
