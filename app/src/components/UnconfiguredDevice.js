/**
 * @flow
 */

import React from 'react';
import PureRenderMixin from 'react-addons-pure-render-mixin';
import {Image, StyleSheet, Text, View} from 'react-native';

import * as actions from '../store/actions';
import Button from './Button';
import {Colors} from './CommonStyles';

import type {Dispatch} from 'silk-redux/action';

export default class UnconfiguredDevice extends React.Component {

  props: {
    configDeviceId: number;
    dispatch: Dispatch<*>;
    style: any;
  };

  shouldComponentUpdate = PureRenderMixin.shouldComponentUpdate;

  render() {
    return (
      <View style={[styles.container, this.props.style]}>
        <Text style={styles.label}>
          New Device Found
        </Text>
        <Image
          source={require('../assets/hub_small.png')}
          style={styles.hubImage}
        />
        <View style={styles.buttonRow}>
          <Button
            type="secondary"
            style={styles.ignoreButton}
            label="Ignore"
            onPress={this._doIgnore}
          />
          <Button
            type="primary"
            style={styles.addButton}
            label="Add"
            onPress={this._doConfigure}
          />
        </View>
      </View>
    );
  }

  _doIgnore = () => {
    const {configDeviceId} = this.props;
    this.props.dispatch(actions.devices.config.accept(configDeviceId));
  };

  _doConfigure = () => {
    const {configDeviceId} = this.props;
    this.props.dispatch(actions.devices.config.accept(configDeviceId));
  };

}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.SilkLabsGreen,
    paddingHorizontal: 12,
    paddingTop: 16,
    paddingBottom: 14,
    borderColor: 'white',
    borderWidth: 2,
  },
  label: {
    fontFamily: 'DIN Round Pro',
    fontSize: 24,
    color: 'white',
    backgroundColor: 'transparent',
  },
  hubImage: {
    width: 58,
    height: 140,
    alignSelf: 'center',
    margin: 12,
  },
  buttonRow: {
    flexDirection: 'row',
    marginTop: 10,
    flex: 1,
  },
  ignoreButton: {
    marginRight: 8,
  },
  addButton: {
    marginLeft: 8,
  },
});
