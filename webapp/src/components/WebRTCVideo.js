import React from 'react';
import Cameras from '../libraries/Cameras';
import createLog from 'silk-log';
import invariant from 'assert';

const log = createLog('webrtc:video');

export class VideoRenderer extends React.Component {

  static propTypes = {
    media: React.PropTypes.shape({
      label: React.PropTypes.string,
      stream: React.PropTypes.object, // MediaStream
    }),
  };

  state = {
    currentTimeMs: null,
    videoWidth: null,
    videoHeight: null,
  };

  render() {
    const {media} = this.props;
    invariant(media);
    invariant(media.stream);
    const {currentTimeMs, videoWidth, videoHeight} = this.state;

    let videoTimeInfo = 'unknown time';
    if (currentTimeMs) {
      videoTimeInfo = (new Date(media.created.getTime() + currentTimeMs)).toString();
    }
    let videoDimensions = '?x?';
    if (videoWidth) {
      videoDimensions = `${videoWidth}x${videoHeight}`;
    }
    return (
      <section>
        {videoDimensions} - {media.label}<br/>
        {videoTimeInfo}<br/>
        {media.stream.active ? media.stream.getTracks().length + ' tracks' : 'inactive'}<br/>
        <video ref="video" autoPlay={true} />
      </section>
    );
  }

  onTimeUpdate = (evt) => {
    const {currentTime, videoWidth, videoHeight} = evt.target;
    this.setState({currentTimeMs: currentTime * 1000, videoWidth, videoHeight});
  };

  componentDidMount() {
    const media = this.props.media;
    invariant(media);
    invariant(media.stream);

    log.info(`Starting video playback ...`);
    const videoElement = this.refs.video;
    videoElement.src = window.URL.createObjectURL(media.stream);
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
      peer.requestRemoteMediaStream('full', {
        video: true,
        /*
        video: {
          width: { max: 320 },
          height: { min: 240 },
          frameRate: { max: 1 },
        },
        */
        audio: false,
      }).catch((err) => {
        log.error(`Failed to request stream: ${err.stack}`);
      });

      peer.on('addstream', () => {
        log.info('add stream');
        this._onMediaUpdate();
      });
      peer.on('removestream', () => {
        log.info('remove stream');
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
        <VideoRenderer key={media.label} media={media} />
      );
    });

    return (
      <div>
        {videos}
      </div>
    );
  }

}
