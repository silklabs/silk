
import React from 'react';
import ReactDOM from 'react-dom';
import createLog from 'silk-log';
import invariant from 'assert';

import Cameras from '../libraries/Cameras';
import * as CanvasUtils from '../libraries/CanvasUtils';

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
  _pixelRatio = 1;

  _camera = null;

  state = {};

  get deviceId() {
    return this.props.deviceId;
  }

  componentWillMount() {
    const devicePixelRatio = window.devicePixelRatio || 1;
    const backingRatio = this.context.webkitBackingStorePixelRatio || 1;
    if (devicePixelRatio !== backingRatio) {
      this._pixelRatio = devicePixelRatio / backingRatio;
    }

    this._camera = Cameras.get(this.deviceId);
    invariant(this._camera, 'No camera');

    this._camera.on('previewImage', this._renderImg);
    this._camera.on('stateChanged', this._onCameraStateChanged);
    this._onCameraStateChanged();
  }

  componentDidMount() {
    this._img = ReactDOM.findDOMNode(this.refs.img);
    this._canvas = ReactDOM.findDOMNode(this.refs.canvas);
    this._context = this._canvas.getContext('2d');
    this._logoImg = document.createElement(`img`);

    this._renderImg();
  }

  componentWillUnmount() {
    if (this._logoImg.src) {
      URL.revokeObjectURL(this._logoImg.src);
    }
    this._camera.removeListener('previewImage', this._renderImg);
    this._camera.removeListener('stateChanged', this._onCameraStateChanged);
  }

  componentDidUpdate(prevProps, prevState) {
    const camera = this._camera;
    if (camera) {
      this._renderedSize = camera.previewSize;
    } else {
      this._renderedSize = null;
    }
    this._renderImg();
  }

  render() {
    const camera = this._camera;

    let canvasWidth, imgWidth;
    let canvasHeight, imgHeight;

    if (camera && camera.previewSize) {
      canvasWidth = imgWidth = camera.previewSize.width;
      canvasHeight = imgHeight = camera.previewSize.height;
    } else {
      // XXX Lame but we need some kind of default placeholder.
      canvasWidth = imgWidth = 320;
      canvasHeight = imgHeight = 180;
    }

    let canvasStyle = Object.assign({}, styles.canvas);
    if (this._pixelRatio !== 1) {
      canvasStyle.width = Math.floor(canvasWidth) + 'px';
      canvasStyle.height = Math.floor(canvasHeight) + 'px';

      canvasWidth *= this._pixelRatio;
      canvasHeight *= this._pixelRatio;
    }

    return (
      <div style={styles.container}>
        <img
          width={imgWidth}
          height={imgHeight}
          style={styles.img}
          ref="img"
        />
        <canvas
          width={canvasWidth}
          height={canvasHeight}
          style={canvasStyle}
          ref="canvas"
        />
      </div>
    );
  }

  _onCameraStateChanged = () => {
    const camera = this._camera;

    if (camera.previewSize !== this._renderedSize) {
      if (this._img) {
        this._img.width = this._canvas.width = camera.previewSize.width;
        this._img.height = this._canvas.height = camera.previewSize.height;
      }
      this._renderedSize = camera.previewSize;
    }
    this._renderImg();
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
    if (!img) {
      return;
    }
    const camera = this._camera;

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
      this._previewTimestamp = 0;
      this._renderCanvas();
    }
  };

  _renderCanvas = () => {
    requestAnimationFrame(() => {
      const canvas = this._canvas;
      const context = this._context;

      context.save();

      if (this._pixelRatio !== 1) {
        context.scale(this._pixelRatio, this._pixelRatio);
      }

      try {
        this._renderCanvasInternal(context,
                                   canvas.width / this._pixelRatio,
                                   canvas.height / this._pixelRatio);
      } catch (err) {
        log.warn(err);
      }

      context.restore();
    });
  };

  _renderCanvasInternal(context, canvasWidth, canvasHeight) {
    context.clearRect(0, 0, canvasWidth, canvasHeight);

    const camera = this._camera;
    invariant(camera, 'null camera');

    const defaultFont = ' DINRound';

    if (!camera.online || !this._previewTimestamp) {
      context.fillStyle =
        camera.online ?
        CanvasUtils.colors.transparentDarkGray :
        CanvasUtils.colors.transparentGray;
      context.fillRect(0, 0, canvasWidth, canvasHeight);
    }

    // Objects.
    if (camera.online && this._previewTimestamp) {
      const time = this._previewTimestamp.getTime();
      const objects = camera.objects.collect(time - 1000, time);
      if (objects.size) {
        context.lineWidth = 1;
        context.font = '10px' + defaultFont;
        context.textAlign = 'start';
        context.textBaseline = 'top';

        const drawArgs = {
          context,
          container: {
            width: canvasWidth,
            height: canvasHeight,
          },
          labelHeight: 11,
          labelPadding: 1,
        };

        // Scale object rectangles from objectsSize to previewSize
        const xScale = camera.previewSize.width / camera.objectsSize.width;
        const yScale = camera.previewSize.height / camera.objectsSize.height;

        objects.forEach((objectArray, index) => {
          objectArray.forEach((object) => {
            let rects = object.rects;

            if (!rects.length) {
              const offsetX = Math.round(canvasWidth * 100 / 90);
              const offsetY = Math.round(canvasHeight * 100 / 90);
              rects = [{
                x: offsetX,
                y: offsetY,
                width: canvasWidth - offsetX,
                height: canvasHeight - offsetY,
              }];
            }

            const label = object.name || object.tag || null;
            const colors =
              CanvasUtils.colorsForLabel(label || index.toString());

            drawArgs.color = colors.background;
            drawArgs.label = label;
            drawArgs.labelColor = colors.label;

            object.rects.forEach((rect) => {
              drawArgs.rect = {
                x: Math.round(rect.x * xScale),
                y: Math.round(rect.y * yScale),
                width: Math.round(rect.width * xScale),
                height: Math.round(rect.height * yScale),
              };
              CanvasUtils.drawObject(drawArgs);
            });
          });
        });
      }
    }

    // Camera name
    context.font = '12px' + defaultFont;
    context.fillStyle = 'white';
    context.textAlign = 'end';
    context.textBaseline = 'bottom';
    context.fillText(camera.name, canvasWidth - 5, canvasHeight - 5);

    context.textAlign = 'end';
    context.textBaseline = 'top';

    let text;
    switch (camera.state) {
    case 'online':
      // Timestamp
      if (this._previewTimestamp) {
        const dateString = this._previewTimestamp.toLocaleDateString();
        const timeString = this._previewTimestamp.toLocaleTimeString();

        text = `${dateString} ${timeString}`;
      } else {
        text = 'No preview available';
      }
      break;
    case 'offline':
      // Offline indicator.
      text = 'Offline since ' + camera.lastSeenAt.toTimeString();
      break;
    case 'connecting':
      text = 'Connecting...';
      break;
    case 'unauthorized':
      text = 'Unauthorized';
      break;
    default:
      invariant(false, `Unknown camera state: ${camera.state}`);
    }
    context.fillText(text, canvasWidth - 5, 5);

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
