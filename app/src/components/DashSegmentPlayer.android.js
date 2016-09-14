/**
 * @flow
 */

import React from 'react';
import {
  StyleSheet,
  UIManager,
  View,
  findNodeHandle,
  requireNativeComponent,
} from 'react-native';
import createLog from 'silk-log';

const MSEPlayer = requireNativeComponent('SilkMSEPlayer');

const log = createLog('DashSegmentPlayer');

const NATIVE_REF = 'player';
const DEFAULT_WEBVIEW_URL = 'file:///android_asset/mse.html';

export default class DashSegmentPlayer extends React.Component {

  render() {
    const {current} = this.props.config;
    return (
      <View style={this.props.style}>
        <MSEPlayer
          style={styles.player}
          ref={NATIVE_REF}
          source={{uri: current.get().mseWebviewUrl || DEFAULT_WEBVIEW_URL}}
          javaScriptEnabled={true}
          onLoadingStart={this.onLoadingStart}
          onLoadingFinish={this.onLoadingFinish}
          onLoadingError={this.onLoadingError}
        />
      </View>
    );
  }

  getNativeHandle() {
    return findNodeHandle(this.refs[NATIVE_REF]);
  }

  enqueue(blob: Blob): Promise<void> {
    UIManager.dispatchViewManagerCommand(
      this.getNativeHandle(),
      UIManager.SilkMSEPlayer.Commands.enqueueSegment,
      [URL.createObjectURL(blob)]
    );
    // TODO: this is totally cheating
    return new Promise((resolve) => process.nextTick(resolve));
  }

  play() {
    UIManager.dispatchViewManagerCommand(
      this.getNativeHandle(),
      UIManager.SilkMSEPlayer.Commands.play
    );
  }

  pause() {
    UIManager.dispatchViewManagerCommand(
      this.getNativeHandle(),
      UIManager.SilkMSEPlayer.Commands.pause
    );
  }

  onLoadingStart = (event) => {
    log.debug('onLoadingStart', event);
  };
  onLoadingFinish = (event) => {
    log.debug('onLoadingFinish', event);
  };
  onLoadingError = (event) => {
    log.debug('onLoadingError', event);
  };

}

const styles = StyleSheet.create({
  player: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    right: 0,
  },
});
