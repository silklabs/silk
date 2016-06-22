import React from 'react';
import Cameras from '../libraries/Cameras';
import createLog from 'silk-log';

const log = createLog('webrtc:video');

export class VideoRenderer extends React.Component {

  static propTypes = {
    media: React.PropTypes.shape({
      label: React.PropTypes.string,
      // MediaStream
      stream: React.PropTypes.object,
    }),
  };

  render() {
    const { media } = this.props;
    return (
      <section>
        <h1>{media.label}</h1>
        <video ref="video" autoplay={true} />
      </section>
    );
  }

  _ensureVideoPlay(media) {
    log.info(`Starting video playback ...`);
    const videoElement = this.refs.video;
    videoElement.src = window.URL.createObjectURL(event.stream);
  }

  componentDidMount() {
    if (this.props.media && this.props.media.stream) {
      this._ensureVideoPlay(this.props.media);
    }
  }

  componentWillReceiveProps(nextProps) {
    if (!this.props.media && nextProps.media && nextProps.media.stream) {
      this._ensureVideoPlay(nextProps.media);
    }
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
    const { peer } = this.state;
    const streams = Array.from(peer.getMediaStreams().values());
    this.setState({ streams });
  };

  _setPeer(peer) {
    log.info('Setting up peer ...');
    this.setState({ peer }, this._onMediaUpdate);

    peer.requestRemoteMediaStream('full', {
      video: true,
      audio: false,
    }).catch((err) => {
      log.error(`Failed to request stream: ${err.stack}`);
    });

    peer.on('addstream', this._onMediaUpdate);
    peer.on('removestream', this._onMediaUpdate);
  }

  _init(camera) {
    const peer = camera.getPeer();
    if (peer) {
      this._setPeer(peer);
      return;
    }

    camera.on('peer', (peer) => {
      this._setPeer(peer);
    });
  }

  _checkForCamera = () => {
    log.info(`checking for camera: ${this.deviceId}`);
    const camera = Cameras.cameras[this.deviceId];
    if (camera) {
      log.info(`Initializing with camera: ${this.deviceId}`);
      this._init(camera);
      Cameras.removeListener('stateChanged', this._checkForCamera);
      return true;
    }
    log.info(`Waiting for camera: ${this.deviceId}`);
    return false;
  };

  componentWillMount() {
    if (!this._checkForCamera()) {
      log.info(`Observing state change`);
      Cameras.on('stateChanged', this._checkForCamera);
    }
  }

  render() {
    const { streams } = this.state;
    if (streams.length === 0) {
      return (
        <div>No streams yet</div>
      );
    }

    const videos = streams.map((media) => {
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
