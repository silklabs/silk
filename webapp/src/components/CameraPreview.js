
import React from 'react';
import ReactDOM from 'react-dom';
import Cameras from '../libraries/Cameras';
import mklog from 'log'; const log = mklog('CameraPreview');

export default class CameraPreview extends React.Component {
  static propTypes = {
    deviceId: React.PropTypes.string,
  };

  state = { camera: null };

  get deviceId() {
    return this.props.deviceId;
  }

  componentWillMount() {
    Cameras.on('stateChanged', this.onCamerasStateChanged);
    this.onCamerasStateChanged(Cameras);
  }

  componentDidMount() {
    this._canvas = ReactDOM.findDOMNode(this);
    this._context = this._canvas.getContext('2d');
  }

  componentWillUnmount() {
    let camera = this.state.camera;
    if (camera) {
      camera.removeListener('previewImage', this.onPreviewImage);
    }
    Cameras.removeListener('stateChanged', this.onCamerasStateChanged);
  }

  shouldComponentUpdate() {
    // render() only if the camera has changed.  For normal state updates, the
    // onPreviewImage() listener manages updating the canvas outside of React.
    const update = this._shouldComponentUpdate;
    this._shouldComponentUpdate = false;
    return update;
  }

  render() {
    let camera = this.state.camera;
    if (!camera || !camera.previewSize) {
      return <canvas />;
    }
    let {width, height} = camera.previewSize;
    return <canvas width={width} height={height} style={{backgroundColor: 'lightgray'}} />;
  }

  componentDidUpdate() {
    this.renderPreview();
  }

  onCamerasStateChanged = state => {
    let oldCamera = this.state.camera;
    let newCamera = state.cameras[this.deviceId];

    if (oldCamera === newCamera) {
      // If the camera is the same but the online state has changed, this
      // component should be re-rendered as the preview window size may have
      // changed.
      if (this.state.online === newCamera.online) {
        return;
      }
    } else {
      if (oldCamera) {
        oldCamera.removeListener('previewImage', this.onPreviewImage);
      }
      if (newCamera) {
        newCamera.on('previewImage', this.onPreviewImage);
      }
    }
    this._shouldComponentUpdate = true;
    this.setState({ camera: newCamera, online: newCamera && newCamera.online });
  };

  onPreviewImage = () => this.renderPreview();

  renderPreview() {
    let canvas = this._canvas;
    if (!canvas) {
      return;
    }
    let context = this._context;

    context.save();
    context.globalAlpha = 1;
    context.clearRect(0, 0, canvas.width, canvas.height);

    let camera = this.state.camera;
    if (camera) {
      // Preview image
      if (camera.online && camera.previewImage.src !== '') {
        try {
          context.drawImage(camera.previewImage, 0, 0);
        } catch (err) {
          if (err.name === 'NS_ERROR_NOT_AVAILABLE') {
            // Ignore the occasional Firefox "NS_ERROR_NOT_AVAILABLE: Component is
            // not available" complaint
            log.warn('Error:', err.stack || err);
          } else {
            throw err;
          }
        }
      } else {
        context.fillStyle = 'grey';
        context.fillRect(0, 0, canvas.width, canvas.height);

        if (!camera.online) {
          context.fillStyle = 'white';
          context.font = '12px serif';
          context.textAlign = 'start';
          context.textBaseline = 'top';
          context.fillText('Offline', 5, 5);
        }
      }

      // Objects
      let objects = camera.online && camera.previewObjects;
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
      context.textBaseline = 'bottom';

      // Camera name
      context.textAlign = 'end';
      context.fillText(camera.name, canvas.width - 5, canvas.height - 5);

      // Timestamp
      let when = camera.online && camera.previewTimestamp;
      if (when) {
        context.textAlign = 'start';
        context.fillText(when.toLocaleDateString() + ' ' + when.toLocaleTimeString(),
          5, canvas.height - 5);
      }

      // Logo
      if (camera.online && camera.logoImage.src !== '') {
        context.globalAlpha = 0.50;
        try {
          context.drawImage(camera.logoImage, 0, 0);
        } catch (err) {
          if (err.name !== 'NS_ERROR_NOT_AVAILABLE') {
            // Ignore the occasional Firefox "NS_ERROR_NOT_AVAILABLE: Component is
            // not available" complaint
            log.warn('Error:', err.stack || err);
          } else {
            throw err;
          }
        }
      }
      context.restore();
    }
  }
}

