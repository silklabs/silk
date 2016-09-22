
import React from 'react';
import ReactDOM from 'react-dom';
import createLog from 'silk-log';
import invariant from 'assert';

import Cameras from '../libraries/Cameras';
import * as CanvasUtils from '../libraries/CanvasUtils';
import WebRTCVideo from './WebRTCVideo';

const log = createLog('CameraPreview');

const styles = {
  container: {
    position: 'relative',
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

  _canvas = null;
  _context = null;
  _logoImg = null;

  _previewActive = false;

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
  }

  componentDidMount() {
    this._canvas = ReactDOM.findDOMNode(this.refs.canvas);
    this._context = this._canvas.getContext('2d');
    this._camera.on('stateChanged', this.onCameraStateChanged);
    this.onCameraStateChanged();
  }

  componentWillUnmount() {
    this._onVideoActive(null, false);
    this._camera.removeListener('stateChanged', this.onCameraStateChanged);
  }

  onCameraStateChanged = () => {
    this._renderCanvas();
  }

  render() {
    const camera = this._camera;

    let width, height;
    let canvasWidth, canvasHeight;

    if (camera && camera.previewSize) {
      width = camera.previewSize.width;
      height = camera.previewSize.height;
    } else {
      // XXX Lame but we need some kind of default placeholder.
      width = 320;
      height = 180;
    }

    canvasWidth = width;
    canvasHeight = height;
    let canvasStyle = Object.assign({}, styles.canvas);
    if (this._pixelRatio !== 1) {
      canvasStyle.width = Math.floor(canvasWidth) + 'px';
      canvasStyle.height = Math.floor(canvasHeight) + 'px';

      canvasWidth *= this._pixelRatio;
      canvasHeight *= this._pixelRatio;
    }

    return (
      <div style={styles.container}>
        <WebRTCVideo
          width={width}
          height={height}
          deviceId={this.deviceId}
          onVideoActive={this._onVideoActive}
          label="preview"
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

  _onVideoActive = (label, active) => {
    this._previewActive = active;
    if (this._renderTimer) {
      clearInterval(this._renderTimer);
      this._renderTimer = null;
    }
    if (active) {
      // Update object boxes 4 times a second
      this._renderTimer = setInterval(this._renderCanvas, 250);
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

    if (!camera.online || !this._previewActive) {
      context.fillStyle =
        camera.online ?
        CanvasUtils.colors.transparentDarkGray :
        CanvasUtils.colors.transparentGray;
      context.fillRect(0, 0, canvasWidth, canvasHeight);
    }

    // Objects.
    if (camera.online && this._previewActive) {
      // Collect objects from the last second (device time)
      const objects = camera.objects.collect(1000);
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
      if (!this._previewActive) {
        text = 'No preview available';
      } else {
        if (camera.objects) {
          const now = new Date(camera.objects.deviceTime);
          const dateString = now.toLocaleDateString();
          const timeString = now.toLocaleTimeString();
          text = `${dateString} ${timeString}`;
        } else {
          text = '';
        }
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
  }
}
