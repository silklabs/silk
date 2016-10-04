/**
 * @flow
 */

import React from 'react';
import {Image, StyleSheet, Text, View} from 'react-native';

import * as actions from '../../store/actions';
import AsyncComponent from '../abstract/AsyncComponent.js';
import Button from '../Button';
import {Colors} from '../CommonStyles';
import SetupScreen from './SetupScreen';

export default class DeviceTouch extends AsyncComponent {

  state = {
    rssi: null,
  };

  componentWillMount() {
    if (__DEV__) {
      const {unconfigured, configuring} = this.props.devices;
      const session = unconfigured.get(configuring.socketId);
      session.on('rssiUpdate', this._onRSSI);
    }
  }

  componentWillUnmount() {
    if (__DEV__) {
      const {unconfigured, configuring} = this.props.devices;
      const session = unconfigured.get(configuring.socketId);
      session.removeListener('rssiUpdate', this._onRSSI);
    }
  }

  _onRSSI = (rssi: number) => {
    this.setStateAsync({rssi});
  };

  render() {
    const {configuring} = this.props.devices;
    let phone;
    if (configuring.passedProximityGate) {
      phone = (
        <Image
          key="phone_green"
          source={require('../../assets/phone_green.png')}
          style={[styles.phoneImage, styles.phoneImageTouched]}
        />
      );
    } else {
      phone = (
        <Image
          key="phone_red"
          source={require('../../assets/phone_red.png')}
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
            onPress={this._onCancel}
            label="Cancel"
          />
        }>
        <View style={styles.content}>
          <Image
            source={require('../../assets/hub_large.png')}
            style={styles.hubImage}
          />
          {phone}
        </View>
        {rssi}
      </SetupScreen>
    );
  }

  _onCancel = () => {
    this.props.dispatch(actions.devices.config.abort());
  };

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
