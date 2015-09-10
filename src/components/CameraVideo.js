/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

import React from 'react';
import { Button } from 'react-bootstrap';

export default class CameraVideo extends React.Component {
  static propTypes = {
    camera: React.PropTypes.object,
    onClick: React.PropTypes.func,
  }

  componentDidMount() {
    let camera = this.props.camera;
    if (camera) {
      camera.on('videoClip', this.onVideoClip);
    }
    this.video = React.findDOMNode(this.refs.video);
  }

  componentWillReceiveProps(nextProps) {
    let prevCamera = this.props.camera;
    let nextCamera = nextProps.camera;

    if (prevCamera && nextCamera) {
      if (prevCamera.id === nextCamera.id) {
        return; // Camera ID is unchanged, nothing to do
      }
    }

    if (prevCamera) {
      prevCamera.removeListener('videoClip', this.onVideoClip);
    }
    if (nextCamera) {
      nextCamera.on('videoClip', this.onVideoClip);
    }
  }

  componentWillUnmount() {
    let camera = this.props.camera;
    if (camera) {
      camera.removeListener('videoClip', this.onVideoClip);
    }
  }

  onVideoClip = clip => {
    if (this.video) {
      this.video.src = clip;
    }
  }

  render() {
    return (
      <div>
        <video ref='video' onClick={this.props.onClick} autoPlay/>
        <Button bsStyle='primary' block onClick={this.props.onClick}>Close</Button>
      </div>
    );
  }
}
