/**
 * @flow
 */

import React from 'react';
import PureRenderMixin from 'react-addons-pure-render-mixin';
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import {RTCView} from 'react-native-webrtc';

import AsyncComponent from './abstract/AsyncComponent';
import * as actions from '../store/actions';

import type {RegisteredDevice} from 'silk-app-sdk/src/store/device_reducers';
import type {Dispatch} from 'silk-redux/action';

type Props = {
  device: RegisteredDevice;
  onClose?: Function;
  dispatch: Dispatch<*>;
};

export default class CameraLiveVideoRTC extends AsyncComponent {

  props: Props;
  state = {
    showingControls: false,
  };

  shouldComponentUpdate = PureRenderMixin.shouldComponentUpdate;

  componentWillMount() {
    this.props.dispatch(
      actions.devices.rtc.videoEnable(this.props.device.deviceId)
    );
  }

  componentWillUnmount() {
    this.props.dispatch(
      actions.devices.rtc.videoDisable(this.props.device.deviceId)
    );
  }

  _toggleControls = () => {
    this.setState({
      showingControls: !this.state.showingControls,
    });
  };

  _renderControls() {
    if (!this.state.showingControls) {
      return null;
    }
    return (
      <View style={styles.controls}>
        <Text
          onPress={this.props.onClose}
          style={styles.doneButton}>
          Done
        </Text>
      </View>
    );
  }

  render() {
    let video = <ActivityIndicator color="white" />;
    const {videoStream} = this.props.device.rtc;
    if (videoStream) {
      video = (
        <RTCView
          streamURL={videoStream.id}
          style={styles.video}
        />
      );
    }
    return (
      <Modal
        visible={true}
        supportedOrientations={['landscape']}
        onRequestClose={() => undefined}>
        <View style={styles.container}>
          <TouchableWithoutFeedback onPress={this._toggleControls}>
            <View style={[styles.video, styles.videoContainer]}>
              {video}
            </View>
          </TouchableWithoutFeedback>
          <View
            style={[styles.video, styles.videoOverlay]}
            pointerEvents="box-none">
            {this._renderControls()}
          </View>
        </View>
      </Modal>
    );
  }

}


const styles = StyleSheet.create({
  videoContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },

  controls: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    right: 0,
  },

  video: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    right: 0,
  },

  videoOverlay: {
    backgroundColor: 'transparent',
  },

  doneButton: {
    padding: 10,
    fontSize: 14,
    color: 'black',
    backgroundColor: 'rgba(128, 128, 128, 0.5)',
  },

  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'black',
  },
});
