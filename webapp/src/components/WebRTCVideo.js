import React from 'react';
import Cameras from '../libraries/Cameras';
import createLog from 'silk-log';
import invariant from 'assert';

const log = createLog('webrtc:video');

export class VideoRenderer extends React.Component {

  static propTypes = {
    stream: React.PropTypes.object, // MediaStream
  };

  state = {
    currentTimeMs: null,
    videoWidth: null,
    videoHeight: null,
  };

  render() {
    const {stream} = this.props;
    invariant(stream);
    const {videoWidth, videoHeight} = this.state;

    const videoDimensions = videoWidth ? `${videoWidth}x${videoHeight}` : '';
    return (
      <div>
        {videoDimensions}<br/>
        {stream.active ? stream.getTracks().length + ' tracks' : 'inactive'}<br/>
        <video ref="video" autoPlay={true}/>
      </div>
    );
  }

  onTimeUpdate = (evt) => {
    const {currentTime, videoWidth, videoHeight} = evt.target;
    this.setState({currentTimeMs: currentTime * 1000, videoWidth, videoHeight});
  };

  componentDidMount() {
    const {stream} = this.props;
    invariant(stream);

    log.info(`Starting video playback ...`);
    const videoElement = this.refs.video;
    videoElement.src = window.URL.createObjectURL(stream);
    videoElement.addEventListener('timeupdate', this.onTimeUpdate);
  }

  componentWillUnmount() {
    const videoElement = this.refs.video;
    videoElement.removeEventListener('timeupdate', this.onTimeUpdate);
  }
}

export default class WebRTCVideo extends React.Component {

  static propTypes = {
    params: React.PropTypes.shape({
      deviceId: React.PropTypes.string,
    }),
  };

  state = {
    peer: null,
    streams: [],
  };

  get deviceId() {
    return this.props.params.deviceId;
  }

  _onMediaUpdate = () => {
    log.info(`Running media update ...`);
    const {peer} = this.state;
    const streams = peer ? Array.from(peer.getMediaStreams().values()) : [];
    this.setState({streams});
  };

  onActiveCameraStateChanged = () => {
    log.info('camera state changed');
    const camera = this.state.camera;
    const peer = camera.getPeer();

    this.setState({peer}, this._onMediaUpdate);
    if (peer) {
      peer.requestRemoteMediaStream('preview', {
        video: {
          mandatory: [
            {maxWidth: 640},
            {maxFrameRate: 1},
          ],
        },
        audio: false,
      }).catch((err) => {
        log.error(`Failed to request stream: ${err.stack}`);
      });
      peer.requestRemoteMediaStream('full', {
        video: {
          mandatory: [
            {minFrameRate: 10},
          ],
        },
        audio: true,
      }).catch((err) => {
        log.error(`Failed to request stream: ${err.stack}`);
      });

      peer.on('addstream', (foo) => {
        log.info('add stream', foo);
        this._onMediaUpdate();
      });
      peer.on('removestream', (foo) => {
        log.info('remove stream', foo);
        this._onMediaUpdate();
      });
    }
  }

  onCamerasStateChanged = state => {
    log.info(`checking for camera: ${this.deviceId}`);

    const oldCamera = this.state.camera;
    const newCamera = state.cameras[this.deviceId];

    if (oldCamera === newCamera) {
      return;
    }
    if (oldCamera) {
      oldCamera.removeListener('stateChanged', this.onActiveCameraStateChanged);
    }
    if (newCamera) {
      newCamera.addListener('stateChanged', this.onActiveCameraStateChanged);
    }
    this.setState({camera: newCamera});
  };

  componentWillMount() {
    Cameras.on('stateChanged', this.onCamerasStateChanged);
    this.onCamerasStateChanged(Cameras);
  }

  componentWillUnmount() {
    Cameras.removeListener('stateChanged', this.onCamerasStateChanged);
    const camera = this.state.camera;
    if (camera) {
      camera.removeListener('stateChanged', this.onActiveCameraStateChanged);
    }
  }

  render() {
    const {streams} = this.state;
    if (streams.length === 0) {
      return (
        <div>No streams yet for {this.deviceId}</div>
      );
    }

    const videos = streams.map((media) => {
      if (media.stream === null) {
        return (
          <div>{media.label} - No streams yet</div>
        );
      }
      return (
        <div key={media.label}>
          <h3>{media.label}</h3>
          <VideoRenderer stream={media.stream} />
        </div>
      );
    });

    return (
      <div>
        {videos}
      </div>
    );
  }

}
