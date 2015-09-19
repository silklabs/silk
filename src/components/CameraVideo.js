/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

import React from 'react';
import { Button, ButtonGroup, Glyphicon } from 'react-bootstrap';
import { Link } from 'react-router';

import Cameras from '../libraries/Cameras';

export default class CameraVideo extends React.Component {
  state = { camera: null };

  deviceId() {
    return this.props.params.deviceId;
  }

  componentWillMount() {
    Cameras.on('stateChanged', this.onCamerasStateChanged);
    this.onCamerasStateChanged(Cameras);
  }

  componentDidMount() {
    this.video = React.findDOMNode(this.refs.video);
  }

  componentWillUnmount() {
    let camera = this.state.camera;
    if (camera) {
      camera.removeListener('videoClip', this.onVideoClip);
    }
    Cameras.removeListener('stateChanged', this.onCamerasStateChanged);
  }

  onCamerasStateChanged = state => {
    let oldCamera = this.state.camera;
    let newCamera = state.cameras[this.deviceId()];

    if (oldCamera === newCamera) {
      return;
    }
    if (oldCamera) {
      oldCamera.removeListener('videoClip', this.onVideoClip);
    }
    if (newCamera) {
      newCamera.on('videoClip', this.onVideoClip);
    }
    this.setState({ camera: newCamera });
  }

  onVideoClip = clip => {
    if (this.video) {
      this.video.src = clip;
    }
  }

  render() {
    return (
      <div>
        <ButtonGroup>
          <Button bsStyle="warning">
            <Link to="/"><Glyphicon glyph="home" /></Link>
          </Button>
        </ButtonGroup>
        <video ref='video' autoPlay />
      </div>
    );
  }
}
