import React from 'react';
import ReactDOM from 'react-dom';
import Cameras from '../libraries/Cameras';
import createLog from 'silk-log';
import invariant from 'assert';
const log = createLog('webrtcvideo');

export default class WebRTCVideo extends React.Component {
  videoElement: ?HTMLVideoElement = null;

  static propTypes = {
    deviceId: React.PropTypes.string,
    label: React.PropTypes.string.isRequired, // 'preview' or 'video'

    // type OnVideoActiveCB = (label: string, active: bool) => void;
    onVideoActive: React.PropTypes.func,

    // type OnVideoUpdateCB = (label: string, currentTime: number, width: number: height: number) => void;
    onVideoUpdate: React.PropTypes.func,
  };

  _camera = null;

  componentWillMount() {
    this._camera = Cameras.get(this.props.deviceId);
    invariant(this._camera, 'No camera');
  }

  componentDidMount() {
    this.videoElement = ReactDOM.findDOMNode(this.refs.video);
    const videoElement = this.videoElement;
    invariant(videoElement);

    const label = this.props.label;
    this._camera.setMediaStream(label, true);
    this._camera.on('stateChanged', this.onCameraStateChanged);
    this.onCameraStateChanged();

    videoElement.addEventListener('timeupdate', this._onTimeUpdate);
    videoElement.addEventListener('playing', this.onPlaying);
  }

  componentWillUnmount() {
    const label = this.props.label;
    this._camera.removeListener('stateChanged', this.onCameraStateChanged);
    this._camera.setMediaStream(label, false);
  }

  onCameraStateChanged = () => {
    const label = this.props.label;
    const videoElement = this.videoElement;
    invariant(videoElement);

    const mediaStream = this._camera.mediaStreams.get(label);
    if (!mediaStream || !mediaStream.stream) {
      log.info(`No stream availble for ${label}`);
      URL.revokeObjectURL(videoElement.src);
      if (this.props.onVideoActive) {
        this.props.onVideoActive(label, false);
      }
    } else {
      log.info(`Updating video element source for ${label}`);
      invariant(mediaStream.label === label);
      URL.revokeObjectURL(videoElement.src);
      videoElement.src = URL.createObjectURL(mediaStream.stream);
    }
  };

  onPlaying = () => {
    if (this.props.onVideoActive) {
      this.props.onVideoActive(this.props.label, true);
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
