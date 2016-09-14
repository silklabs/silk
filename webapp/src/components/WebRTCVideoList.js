import React from 'react';
import Cameras from '../libraries/Cameras';
import createLog from 'silk-log';

import WebRTCVideo from './WebRTCVideo';

const log = createLog('webrtc:videolist');

export default class WebRTCVideoList extends React.Component {

  static propTypes = {
    params: React.PropTypes.shape({
      deviceId: React.PropTypes.string,
    }),
  };

  _camera: null;

  state = {
    online: false,
  };

  get deviceId() {
    return this.props.params.deviceId;
  }

  componentWillMount() {
    Cameras.on('stateChanged', this.onCamerasStateChanged);
    this.onCamerasStateChanged(Cameras);
  }

  componentWillUnmount() {
    Cameras.removeListener('stateChanged', this.onCamerasStateChanged);
    this.onCamerasStateChanged({cameras: {}});
  }

  onCamerasStateChanged = camerasState => {
    let oldCamera = this._camera;
    let newCamera = camerasState.cameras[this.deviceId];

    if (oldCamera === newCamera) {
      return;
    }
    if (oldCamera) {
      oldCamera.removeListener('stateChanged', this.onActiveCameraStateChange);
    }
    this._camera = newCamera;
    if (newCamera) {
      newCamera.on('stateChanged', this.onActiveCameraStateChange);
      this.onActiveCameraStateChange();
    }
  };

  onActiveCameraStateChange = () => {
    const camera = this._camera;
    this.setState({online: camera && camera.online});
  };

  onVideoUpdate = (label, currentTime, videoWidth, videoHeight) => {
    log.info(`video update for ${label}: ${currentTime}s at ` +
             `${videoWidth}x${videoHeight}`);
  };

  render() {
    const {online} = this.state;
    if (!online) {
      return (
        <div>{this.deviceId} device is not online</div>
      );
    }

    const videos = ['preview', 'video'].map(label => {
      return (
        <div key={label}>
          <WebRTCVideo
            deviceId={this.deviceId}
            label={label}
            onVideoUpdate={this.onVideoUpdate}
          />
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
