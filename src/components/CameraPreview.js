/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

import React from 'react';

export default class CameraPreview extends React.Component {
  static propTypes = {
    camera: React.PropTypes.object
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
      prevCamera.removeListener('previewImage', this.onPreviewImage);
    }
    if (nextCamera) {
      nextCamera.on('previewImage', this.onPreviewImage);
    }
    this._shouldComponentUpdate = true;
  }

  shouldComponentUpdate() {
    let shouldComponentUpdate = this._shouldComponentUpdate;
    this._shouldComponentUpdate = false;
    return shouldComponentUpdate;
  }

  render() {
    let camera = this.props.camera;
    if (!camera) {
      return <canvas />;
    }
    let {width, height} = camera.previewSize;
    return <canvas style={{width, height, backgroundColor: 'lightgrey'}}/>;
  }

  componentDidUpdate() {
    this._canvas = React.findDOMNode(this);
    this._context = this._canvas.getContext('2d');
    this.renderPreview();
  }

  onPreviewImage = () => this.renderPreview()

  renderPreview() {
    let canvas = this._canvas;
    if (!canvas) {
      return;
    }
    let context = this._context;

    context.save();
    context.globalAlpha = 1;
    context.clearRect(0, 0, canvas.width, canvas.height);

    let camera = this.props.camera;
    if (camera) {
      // Preview image
      context.drawImage(camera.previewImage, 0, 0);

      // Objects
      let objects = camera.previewObjects;
      if (objects) {
        let objectColors = [
          'red',
          'lightgreen',
          'lightblue',
          'purple',
          'black',
          'orange',
        ];

        context.lineWidth = 1;
        context.font = '10px sans-serif';

        for (var i = 0; i < objects.length; ++i) {
          context.fillStyle = context.strokeStyle = objectColors[i % objectColors.length];
          context.fillStyle = 'black';

          var tag = objects[i].tag;
          var rects = objects[i].rects;
          for (var j = 0; j < rects.length; ++j) {
            var rect = rects[j];
            context.strokeRect(rect.x, rect.y, rect.width, rect.height);
            context.fillText(tag, rect.x, rect.y + rect.height + 10);
          }
        }
      }

      context.font = '12px serif';
      context.fillStyle = 'white';

      // Camera name
      context.textAlign = 'end';
      context.fillText(camera.name, canvas.width - 5, canvas.height - 5);

      // Timestamp
      let when = camera.previewTimestamp;
      if (when) {
        context.textAlign = 'start';
        context.fillText(when.toLocaleDateString() + ' ' + when.toLocaleTimeString(),
          5, canvas.height - 5);
      }

      // Logo
      context.globalAlpha = 0.50;
      context.drawImage(camera.logoImage, 0, 0);
      context.restore();
    }
  }
}

