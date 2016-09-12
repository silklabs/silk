/**
 * @flow
 */

import React from 'react';
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import {RTCView} from 'react-native-webrtc';
import createLog from 'silk-log';

import AsyncComponent from './abstract/AsyncComponent';

import type {Peer} from 'silk-rtc';

type Props = {
  peer: Peer,
  onClose?: Function;
};

const log = createLog('CameraLiveVideoRTC');
const STREAM_LABEL = 'full';

export default class CameraLiveVideoRTC extends AsyncComponent {

  props: Props;
  state = {
    showingControls: false,
    stream: null,
  };

  mounted = false;

  componentWillMount() {
    this.mounted = true;
    this.initStream();
  }

  componentWillUnmount() {
    this.mounted = false;
    this.props.peer.removeStream(STREAM_LABEL);
  }

  initStream() {
    if (!this.mounted) {
      return;
    }

    log.debug('Requesting remote media stream', STREAM_LABEL);
    const {peer} = this.props;
    peer.requestRemoteMediaStream(STREAM_LABEL, {
      video: true,
      audio: false,
    }).catch((err) => {
      log.error(`Failed to request stream: ${err.stack}`);
      this.initStream();
    });

    peer.on('addstream', ({label, stream}) => {
      log.debug('added stream', label);
      if (label === STREAM_LABEL) {
        this.setStateAsync({stream});
      }
    });
    peer.on('removestream', ({label, stream}) => {
      log.debug('removed stream', label);
      if (label === STREAM_LABEL) {
        this.setStateAsync({stream: null});
        this.initStream();
      }
    });
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
    if (this.state.stream) {
      video = (
        <RTCView
          streamURL={this.state.stream.toURL()}
          style={styles.video}
        />
      );
    }
    return (
      <Modal
        visible={true}
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
