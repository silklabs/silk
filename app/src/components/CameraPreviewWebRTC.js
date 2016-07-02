import React from 'react';
import PureRenderMixin from 'react-addons-pure-render-mixin';
import createLog from 'silk-log';

import AsyncComponent from './abstract/AsyncComponent';
import CameraPreview from './CameraPreview';

const log = createLog('CameraPreviewWebRTC');

export default class CameraPreviewWebRTC extends AsyncComponent {
  static propTypes = {
    ...CameraPreview.propTypes,
    rtcConnection: React.PropTypes.object,
  };

  mounted: false;

  shouldComponentUpdate = PureRenderMixin.shouldComponentUpdate;

  componentWillMount() {
    this.mounted = true;
    if (this.props.rtcConnection) {
      this.subscribeToRTC(this.props.rtcConnection);
    }
  }

  componentWillUnmount() {
    this.mounted = false;
    this.unsubscribeFromRTC(this.props.rtcConnection);
  }

  componentWillReceiveProps(nextProps) {
    if (this.props.rtcConnection !== nextProps.rtcConnection) {
      this.unsubscribeFromRTC(this.props.rtcConnection);
      this.subscribeToRTC(nextProps.rtcConnection);
    }
  }

  subscribeToRTC(rtcConnection) {
    if (!rtcConnection) {
      log.debug('No rtcConnection');
      return;
    }
    const channel = rtcConnection.getChannel('video');
    if (!channel) {
      log.debug('No video channel');
      return;
    }
    channel.on('jpeg', this.onPreviewFrame);
  }

  unsubscribeFromRTC(rtcConnection) {
    if (!rtcConnection) {
      log.debug('No rtcConnection');
      return;
    }
    const channel = rtcConnection.getChannel('video');
    if (!channel) {
      log.debug('No video channel');
      return;
    }
    channel.removeListener('jpeg', this.onPreviewFrame);
  }

  onPreviewFrame = (message) => {
    log.debug('Preview message', message);
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
