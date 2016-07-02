import React from 'react';
import PureRenderMixin from 'react-addons-pure-render-mixin';

import CameraPreview from './CameraPreview';
import SocketIO from '../libraries/SocketIO';
import SocketIOComponent from './abstract/SocketIOComponent';

const DEVICE_RECONNECT_PREVIEW_DELAY_MS = 1000;

export default class CameraPreviewSocketIO extends SocketIOComponent {
  static propTypes = {
    ...CameraPreview.propTypes,
    haveVideoStream: React.PropTypes.bool,
    socket: React.PropTypes.instanceOf(SocketIO),
  };

  mounted: false;

  shouldComponentUpdate = PureRenderMixin.shouldComponentUpdate;

  componentWillMount() {
    this.mounted = true;
    if (this.props.haveVideoStream) {
      this.subscribeToSocket(this.props.socket);
    }
  }

  componentWillUnmount() {
    this.mounted = false;
    this.unsubscribeFromSocket(this.props.socket);
  }

  subscribeToSocket(socket) {
    let { deviceId } = this.props;
    if (!socket || !deviceId || !this.mounted) {
      return;
    }
    let stream = `preview-${deviceId}`;
    socket.on(stream, this.onPreviewFrame);
    socket.join(stream);
  }

  componentWillReceiveProps(nextProps) {
    if (!this.props.haveVideoStream && nextProps.haveVideoStream) {
      // The device was known to us before, but only just now came
      // online. Start subscribing to the device's socket.io room to
      // receive preview images. However, for some reason, subscribing
      // to it immediately can lead to not receiving any messages at all.
      // See https://github.com/silklabs/silk-app/issues/577.
      this.unsubscribeFromSocket(this.props.socket);
      setTimeout(() => {
        this.subscribeToSocket(this.props.socket);
      }, DEVICE_RECONNECT_PREVIEW_DELAY_MS);

      // Also, in anticipation of receiving preview images soon, clear any
      // timeout state.
      this.refs.preview.resetTimeout();
    }
  }

  unsubscribeFromSocket(socket) {
    let { deviceId } = this.props;
    if (!socket || !deviceId) {
      return;
    }
    let stream = `preview-${deviceId}`;
    socket.off(stream, this.onPreviewFrame);
    socket.leave(stream);
  }

  onPreviewFrame = (message, ack) => {
    if (typeof ack === 'function') {
      ack();
    }
    this.refs.preview.pushFrame(message.frame);
  };

  render() {
    return (
      <CameraPreview
        {...this.props}
        ref="preview"
      />
    );
  }

}
