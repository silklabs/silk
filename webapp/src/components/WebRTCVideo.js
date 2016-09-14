import React from 'react';
import Cameras from '../libraries/Cameras';
import createLog from 'silk-log';
import invariant from 'assert';
const log = createLog('webrtcvideo');

export default class WebRTCVideo extends React.Component {

  static propTypes = {
    deviceId: React.PropTypes.string,
    label: React.PropTypes.string.isRequired, // 'preview' or 'video'

    // type OnVideoUpdateCB = (label: string, currentTime: number, width: number: height: number) => void;
    onVideoUpdate: React.PropTypes.func,
  };

  _camera = null;

  componentWillMount() {
    this._camera = Cameras.get(this.props.deviceId);
    invariant(this._camera, 'No camera');
  }

  componentDidMount() {
    const label = this.props.label;
    this._camera.setMediaStream(label, true);
    this._camera.on('stateChanged', this.onCameraStateChanged);
    this.onCameraStateChanged();

    const videoElement = this.refs.video;
    invariant(videoElement);
    videoElement.addEventListener('timeupdate', this._onTimeUpdate);
  }

  componentWillUnmount() {
    const label = this.props.label;
    this._camera.removeListener('stateChanged', this.onCameraStateChanged);
    this._camera.setMediaStream(label, false);
  }

  onCameraStateChanged = () => {
    const label = this.props.label;
    const videoElement = this.refs.video;
    invariant(videoElement);

    log.info(`Updating video element source for ${label}`);
    const mediaStream = this._camera.mediaStreams.get(label);
    if (!mediaStream || !mediaStream.stream) {
      log.info(`No stream for ${label}`);
      videoElement.src = 'nuthin';
    } else {
      invariant(mediaStream.label === label);
      videoElement.src = window.URL.createObjectURL(mediaStream.stream);
    }
  };

  render() {
    return (
      <video
        ref="video"
        {...this.props}
        autoPlay={true}
      />
    );
  }

  _onTimeUpdate = (evt) => {
    const {currentTime, videoWidth, videoHeight} = evt.target;
    if (this.props.onVideoUpdate) {
      this.props.onVideoUpdate(this.props.label, currentTime, videoWidth, videoHeight);
    }
    return true;
  };
}
