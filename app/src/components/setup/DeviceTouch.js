import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import AsyncComponent from '../abstract/AsyncComponent.js';
import Button from '../Button';
import { Colors } from '../CommonStyles';
import SetupScreen from './SetupScreen';

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
    rssi: null,
  };

  mounted = false;

  componentWillMount() {
    this.mounted = true;
    let { bleDeviceSession } = this.props;
    bleDeviceSession.on('secret', this._onDeviceTouch);
    bleDeviceSession.on('rssiUpdate', this._onRSSI);
  }

  componentWillUnmount() {
    this.mounted = false;
    let { bleDeviceSession } = this.props;
    bleDeviceSession.removeListener('secret', this._onDeviceTouch);
    bleDeviceSession.removeListener('rssiUpdate', this._onRSSI);
  }

  _onRSSI = (rssi) => {
    if (!this.mounted || !__DEV__) {
      return;
    }
    this.setState({rssi});
  };

  _onDeviceTouch = (deviceSecret) => {
    let { bleDeviceSession } = this.props;
    bleDeviceSession.removeListener('secret', this._onDeviceTouch);
    bleDeviceSession.removeListener('rssiUpdate', this._onRSSI);
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
    let phone;
    if (this.state.touched) {
      phone = (
        <Image
          key="phone_green"
          source={require('image!phone_green')}
          style={[styles.phoneImage, styles.phoneImageTouched]}
        />
      );
    } else {
      phone = (
        <Image
          key="phone_red"
          source={require('image!phone_red')}
          style={[styles.phoneImage, styles.phoneImageTooFar]}
        />
      );
    }
    let rssi = null;
    if (__DEV__) {
      rssi = (
        <View style={styles.rssi}>
          <Text style={styles.rssiLabel}>
            RSSI: {this.state.rssi}
          </Text>
        </View>
      );
    }
    return (
      <SetupScreen
        title="Tap your device with your phone to begin setup"
        subtitle="Just like using a bus pass!"
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
          {phone}
        </View>
        {rssi}
      </SetupScreen>
    );
  }

}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    marginVertical: 24,
  },
  phoneImage: {
    width: 72,
    height: 136,
  },
  phoneImageTooFar: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  phoneImageTouched: {
    position: 'absolute',
    top: 0,
    right: 50,
    transform: [{rotate: '20deg'}],
  },
  hubImage: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 95,
    height: 230,
  },
  rssi: {
    flex: 2,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  rssiLabel: {
    fontFamily: 'DIN Round Pro',
    fontWeight: '600',
    fontSize: 14,
    color: Colors.SilkLabsBlack,
    backgroundColor: 'transparent',
  },
});
