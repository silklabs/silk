import React from 'react-native';
import createLog from 'silk-log';

import Config from '../libraries/Config';
import { blobURI } from '../libraries/Util';

const {
  StyleSheet,
  View,
} = React;
const MSEPlayer = React.requireNativeComponent('SilkMSEPlayer');

const log = createLog('DashSegmentPlayer');

const NATIVE_REF = 'player';
const DEFAULT_WEBVIEW_URL = 'file:///android_asset/mse.html';

export default class DashSegmentPlayer extends React.Component {

  render() {
    return (
      <View style={this.props.style}>
        <MSEPlayer
          style={styles.player}
          ref={NATIVE_REF}
          url={Config.get().mseWebviewUrl || DEFAULT_WEBVIEW_URL}
          javaScriptEnabled={true}
          onLoadingStart={this.onLoadingStart}
          onLoadingFinish={this.onLoadingFinish}
          onLoadingError={this.onLoadingError}
        />
      </View>
    );
  }

  getNativeHandle() {
    return React.findNodeHandle(this.refs[NATIVE_REF]);
  }

  enqueue(segment) {
    React.UIManager.dispatchViewManagerCommand(
      this.getNativeHandle(),
      React.UIManager.SilkMSEPlayer.Commands.enqueueSegment,
      [blobURI(segment.blob)]
    );
  }

  play() {
    React.UIManager.dispatchViewManagerCommand(
      this.getNativeHandle(),
      React.UIManager.SilkMSEPlayer.Commands.play
    );
  }

  pause() {
    React.UIManager.dispatchViewManagerCommand(
      this.getNativeHandle(),
      React.UIManager.SilkMSEPlayer.Commands.pause
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
