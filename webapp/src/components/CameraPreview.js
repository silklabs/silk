
import React from 'react';
import ReactDOM from 'react-dom';
import createLog from 'silk-log';

import Cameras from '../libraries/Cameras';

const log = createLog('CameraPreview');

const styles = {
  container: {
    position: 'relative',
  },
  img: {
    display: 'block',
  },
  canvas: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
};

export default class CameraPreview extends React.Component {
  static propTypes = {
    deviceId: React.PropTypes.string,
  };

  _img = null;
  _canvas = null;
  _context = null;
  _logoImg = null;

  _previewTimestamp = 0;
  _logoImgLoaded = false;

  _renderedSize = null;

  state = {
    camera: null,
  };

  get deviceId() {
    return this.props.deviceId;
  }

  componentWillMount() {
    Cameras.on('stateChanged', this._onCamerasStateChanged);
    this._onCamerasStateChanged();
  }

  componentDidMount() {
    this._img = ReactDOM.findDOMNode(this.refs.img);
    this._canvas = ReactDOM.findDOMNode(this.refs.canvas);
    this._context = this._canvas.getContext('2d');
    this._logoImg = document.createElement(`img`);

    this._renderImg();
  }

  componentWillUnmount() {
    const camera = this.state.camera;
    if (camera) {
      camera.removeListener('previewImage', this._renderImg);
      camera.removeListener('objects', this._renderCanvas);
    }
    if (this._logoImg.src) {
      URL.revokeObjectURL(this._logoImg.src);
    }
    Cameras.removeListener('stateChanged', this._onCamerasStateChanged);
  }

  componentDidUpdate(prevProps, prevState) {
    const camera = this.state.camera;
    if (camera) {
      this._renderedSize = camera.previewSize;
    } else {
      this._renderedSize = null;
    }
    this._renderImg();
  }

  render() {
    const camera = this.state.camera;

    let width;
    let height;

    if (camera && camera.previewSize) {
      width = camera.previewSize.width;
      height = camera.previewSize.height;
    } else {
      // XXX Lame but we need some kind of default placeholder.
      width = 320;
      height = 180;
    }

    return (
      <div style={styles.container}>
        <img width={width} height={height} style={styles.img} ref="img" />
        <canvas width={width} height={height} style={styles.canvas} ref="canvas" />
      </div>
    );
  }

  _onCamerasStateChanged = () => {
    const oldCamera = this.state.camera;
    const newCamera = Cameras.cameras[this.deviceId];

    if (oldCamera !== newCamera) {
      if (oldCamera) {
        oldCamera.removeListener('previewImage', this._renderImg);
        oldCamera.removeListener('objects', this._renderCanvas);
      }
      if (newCamera) {
        newCamera.addListener('previewImage', this._renderImg);
        newCamera.addListener('objects', this._renderCanvas);
      }
      this._resetLogoImg();
      this.setState({camera: newCamera});
      return;
    }

    if (newCamera.previewSize !== this._renderedSize) {
      this._img.width = this._canvas.width = newCamera.previewSize.width;
      this._img.height = this._canvas.height = newCamera.previewSize.height;
      this._renderedSize = newCamera.previewSize;
      this._renderImg();
      return;
    }
  };

  _resetLogoImg() {
    this._logoImgLoaded = false;
    if (this._logoImg) {
      this._logoImg.onload = null;
      if (this._logoImg.src) {
        URL.revokeObjectURL(this._logoImg.src);
        this._logoImg.src = ``;
      }
    }
  }

  _renderImg = () => {
    const img = this._img;
    const camera = this.state.camera;

    if (img.src) {
      URL.revokeObjectURL(img.src);
    }

    if (camera && camera.previewImage) {
      const src = URL.createObjectURL(camera.previewImage);
      const timestamp = camera.previewTimestamp;
      img.onload = () => {
        URL.revokeObjectURL(src);
        this._previewTimestamp = timestamp;
        this._renderCanvas();
      };
      img.src = src;
    } else {
      img.src = ``;
      this._previewTimestamp = 0;
    }
    this._renderCanvas();
  };

  _renderCanvas = () => {
    requestAnimationFrame(() => {
      const canvas = this._canvas;
      const context = this._context;

      context.save();

      try {
        this._renderCanvasInternal(context, canvas.width, canvas.height);
      } catch(err) {
        log.warn(err);
      }

      context.restore();
    });
  };

  _renderCanvasInternal(context, width, height) {
    context.clearRect(0, 0, width, height);

    const camera = this.state.camera;
    if (!camera) {
      // XXX Leave transparent?
      return;
    }

    const defaultFont = '12px sans-serif';

    context.globalAlpha = 1;

    if (!camera.online || !this._previewTimestamp) {
      context.fillStyle = camera.online ? 'lightgrey' : 'grey';
      context.fillRect(0, 0, width, height);
    }

    // Objects.
    if (this._previewTimestamp) {
      const time = this._previewTimestamp.getTime();
      const objects = camera.objects.collect(time - 250, time + 750);
      if (objects.length) {
        const objectColors = [
          'red',
          'lightgreen',
          'lightblue',
          'purple',
          'black',
          'orange',
        ];

        context.lineWidth = 1;
        context.font = '10px sans-serif';
        context.fillStyle = 'black';

        objects.forEach((object, index) => {
          const label = object.name || object.tag;
          context.strokeStyle = objectColors[index % objectColors.length];

          object.rects.forEach((rect) => {
            context.strokeRect(rect.x, rect.y, rect.width, rect.height);
            context.fillText(label, rect.x, rect.y + rect.height + 10);
          });
        });
      }
    }

    // Camera name
    context.font = defaultFont;
    context.fillStyle = 'white';
    context.textAlign = 'end';
    context.textBaseline = 'bottom';
    context.fillText(camera.name, width - 5, height - 5);

    if (camera.online) {
      // Timestamp
      if (this._previewTimestamp) {
        const dateString = this._previewTimestamp.toLocaleDateString();
        const timeString = this._previewTimestamp.toLocaleTimeString();

        context.textAlign = 'start';
        context.fillText(`${dateString} ${timeString}`, 5, height - 5);
      }
    } else {
      // Offline indicator.
      context.textAlign = 'end';
      context.textBaseline = 'top';
      context.fillText('Offline', width - 5, 5);
    }

    // Logo
    if (this._logoImgLoaded) {
      context.globalAlpha = 0.50;
      try {
        context.drawImage(this._logoImg, 0, 0);
      } catch (err) {
        if (err.name === 'NS_ERROR_NOT_AVAILABLE') {
          // Ignore the occasional Firefox "NS_ERROR_NOT_AVAILABLE: Component is
          // not available" complaint
          log.warn(err);
        } else {
          throw err;
        }
      }
    } else if (camera.logoImage && !this._logoImg.src) {
      const src = URL.createObjectURL(camera.logoImage);
      this._logoImg.onload = () => {
        this._logoImg.onload = null;
        URL.revokeObjectURL(src);
        this._logoImgLoaded = true;
      };
      this._logoImg.src = src;
    }
  }
}
