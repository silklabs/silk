import React from 'react';
import {
  StyleSheet,
  Text,
  View,
} from 'react-native';

import AsyncComponent from '../abstract/AsyncComponent.js';
import Button from '../Button';
import { SetupStyles } from '../CommonStyles';

import { DeviceSession } from '../../libraries/ble/DeviceManager';

const AFTER_TOUCH_WAIT_MS = 250;

export default class DeviceTouch extends AsyncComponent {

  static propTypes = {
    bleDeviceSession: React.PropTypes.instanceOf(DeviceSession).isRequired,
    onCancel: React.PropTypes.func.isRequired,
    onSave: React.PropTypes.func.isRequired,
  };

  state = {
    touched: false,
    deviceSecret: null,
  };

  mounted = false;

  componentWillMount() {
    this.mounted = true;
    let { bleDeviceSession } = this.props;
    bleDeviceSession.on('secret', this._onDeviceTouch);
  }

  componentWillUnmount() {
    this.mounted = false;
    let { bleDeviceSession } = this.props;
    bleDeviceSession.removeListener('secret', this._onDeviceTouch);
  }

  _onDeviceTouch = (deviceSecret) => {
    let { bleDeviceSession } = this.props;
    bleDeviceSession.removeListener('secret', this._onDeviceTouch);
    if (!this.mounted) {
      return;
    }

    this.setStateAsync({
      deviceSecret,
      touched: true,
    });
    setTimeout(() => {
      if (!this.mounted) {
        return;
      }
      this.props.navigator.pushAsync({
        name: 'WifiConfig',
        props: {
          ...this.props,
          deviceSecret: this.state.deviceSecret,
        },
      });
    }, AFTER_TOUCH_WAIT_MS);
  };

  render() {
    return (
      <View style={SetupStyles.container}>
        <Text style={SetupStyles.title}>
          Tap your device with your phone to begin setup
        </Text>
        <Text style={SetupStyles.subtitle}>
          Just like using a bus pass!
        </Text>
        <View style={{flex: 1}} />
        <View style={styles.buttonRow}>
          <Button
            type="secondary"
            onPress={this.props.onCancel}
            label="Cancel"
          />
        </View>
      </View>
    );
  }

}

const styles = StyleSheet.create({
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 16,
  },
  cancelButton: {
  },
});
