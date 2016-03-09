import assert from 'assert';
import React from 'react';
import { Input } from 'react-bootstrap';
import ReactDOM from 'react-dom';
import { prepareDashSegment } from 'silk-cam';
import createLog from 'silk-log';

import Cameras from '../libraries/Cameras';

const log = createLog('CameraVideoMSE');

const CODEC_DESCRIPTOR = 'video/mp4;codecs=avc1.42c01f,mp4a.40.2';

const colors = {
  paleBlue: '#EFF3F3',
  blueGray: '#DCE6E6',
  gray: '#A0A0A0',
  darkGray: '#424242',
  darkBlue: '#267686',
  green: '#3CC0A5',
  red: '#ED734C',
  orange: '#F2A45B',
  paleWarmGray: '#EEE9DF',
};

const styles = {
  global: {
    fontFamily: 'DINRound',
    color: 'white',
    width: '100%',
    height: '100%',
    backgroundColor: colors.red,
  },
  header: {
    width: '100%',
    margin: 0,
    padding: 8,
    textAlign: 'center',
    textTransform: 'uppercase',
    fontSize: '36px',
  },
  consoleContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '33%',
    padding: 10,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  consoleHeader: {
    margin: 0,
    padding: 8,
    fontSize: '20px',
  },
  consoleMessages: {
    margin: 0,
    padding: '0px 8px 8px 8px',
    listStyleType: 'none',
  },
  videoContainer: {
    position: 'relative',
    borderStyle: 'solid',
    borderColor: colors.red,
    borderWidth: '0px 6px',
  },
  video: {
    display: 'block',
    width: '100%',
  },
  canvas: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  form: {
    backgroundColor: colors.red,
    padding: '0px 8px',
    textAlign: 'right',
    opacity: 0.125,
  },
};

function asciiSum(string) {
  let sum = 0;
  for (let index = 0; index < string.length; index++) {
    sum += string.charCodeAt(index);
  }
  return sum;
}

export default class CameraVideo extends React.Component {
  video = null;
  canvas = null;
  context = null;
  mediaSource = null;
  sourceBuffer = null;
  pixelRatio = 1;

  initHeader = null;
  wroteInitHeader = false;
  segmentQ = [];
  segmentState = {
    seqno: 0,
    startTime: 0,
  };
  videoStartTime = 0;
  loadedData = false;
  renderedOnline = false;

  state = {
    camera: null,
    consoleMessages: [],
    showMotionEvents: false,
  };

  get deviceId() {
    return this.props.params.deviceId;
  }

  componentDidMount() {
    log.info('Fetching initialization header');
    fetch('media/default-segment-init.mp4')
      .then(response => response.arrayBuffer())
      .then(arrayBuffer => {
        log.info('Received initialization header');
        this.initHeader = new Uint8Array(arrayBuffer);
        this._feedPlayer();
      });

    this.video = ReactDOM.findDOMNode(this.refs.video);
    this.canvas = ReactDOM.findDOMNode(this.refs.canvas);
    this.context = this.canvas.getContext('2d');
    this.mediaSource = new MediaSource();

    // Listeners and timers that need to be removed in componentWillUnmount().
    window.addEventListener('resize', this._updateCanvasSize);
    Cameras.on('stateChanged', this._onCamerasStateChanged);
    this.mediaSource.addEventListener('sourceopen', this._onSourceOpen);

    const devicePixelRatio = window.devicePixelRatio || 1;
    const backingRatio = this.context.webkitBackingStorePixelRatio || 1;
    if (devicePixelRatio !== backingRatio) {
      this.pixelRatio = devicePixelRatio / backingRatio;
    }

    this.video.src = URL.createObjectURL(this.mediaSource);
    this._onCamerasStateChanged(Cameras);
    this._updateCanvasSize();
  }

  componentWillUnmount() {
    window.removeEventListener('resize', this._updateCanvasSize);
    Cameras.removeListener('stateChanged', this._onCamerasStateChanged);
    this.mediaSource.removeEventListener('sourceopen', this._onSourceOpen);

    const camera = this.state.camera;
    if (camera) {
      camera.removeListener('videoClip', this._onNextVideoClip);
      camera.removeListener('objects', this._onObjects);
    }

    if (this.sourceBuffer) {
      this.sourceBuffer.removeEventListener('updateend', this._feedPlayer);
    }

    URL.revokeObjectURL(this.video.src);
  }

  _updateCanvasSize = () => {
    this._renderCanvas();

    let width = this.video.clientWidth;
    let height = this.video.clientHeight;

    if (this.pixelRatio !== 1) {
      this.canvas.style.width = Math.floor(width) + 'px';
      this.canvas.style.height = Math.floor(height) + 'px';

      width *= this.pixelRatio;
      height *= this.pixelRatio;
    }

    this.canvas.width = Math.floor(width);
    this.canvas.height = Math.floor(height);
  };

  _onCamerasStateChanged = state => {
    const oldCamera = this.state.camera;
    const newCamera = state.cameras[this.deviceId];

    if (oldCamera === newCamera) {
      if (this.renderedOnline !== newCamera.online) {
        this._renderCanvas();
      }
      return;
    }

    this._renderCanvas();

    if (oldCamera) {
      oldCamera.removeListener('videoClip', this._onNextVideoClip);
      oldCamera.removeListener('objects', this._onObjects);

      this.video.pause();
      this.videoStartTime = 0;
      this.loadedData = false;

      if (this.mediaSource.readyState === 'open' && this.sourceBuffer) {
        this.sourceBuffer.abort();
      }

      this.video.currentTime = 0;
    }

    if (newCamera) {
      newCamera.addListener('videoClip', this._onNextVideoClip);
      newCamera.addListener('objects', this._onObjects);
    }

    this.setState({
      camera: newCamera,
    });
  };

  _onNextVideoClip = (url, when, segment) => {
    if (!this.videoStartTime) {
      this.videoStartTime = when.getTime();
    }
    let buffer = new Buffer(segment);
    prepareDashSegment(buffer, this.segmentState);
    this._feedPlayer(null, buffer.toArrayBuffer());
  };

  _onObjects = (objects) => {
    const oldMessages = this.state.consoleMessages;

    const newMessages = new Map();
    objects.forEach((object) => {
      if (object.tag === 'face') {
        let text;
        if ('name' in object) {
          const name = object.name;
          text = name.charAt(0).toUpperCase() + name.substr(1).toLowerCase();
        } else {
          text = 'A face';
        }
        text += ' was seen';

        if (oldMessages.length) {
          for (let index = 0; index < oldMessages.length; index++) {
            const oldMessage = oldMessages[index];
            if (oldMessage.id === object.id && oldMessage.text === text) {
              return;
            }
          }
        }
        newMessages.set(object.id, text);
      }
    });

    if (!newMessages.size) {
      return;
    }

    const consoleMessages = oldMessages.slice();
    newMessages.forEach((text, id) => {
      consoleMessages.push({
        id,
        text,
      });
    });

    if (consoleMessages.length > 4) {
      consoleMessages.splice(0, consoleMessages.length - 4);
    }

    this.setState({
      consoleMessages,
    });
  };

  _onMotionCheck = () => {
    const checked = this.refs.checkMotion.getChecked();
    if (checked === this.state.showMotionEvents) {
      return;
    }

    this._renderCanvas();
    this.setState({
      showMotionEvents: checked,
    });
  };

  _onSourceOpen = () => {
    this.sourceBuffer = this.mediaSource.addSourceBuffer(CODEC_DESCRIPTOR);
    this.sourceBuffer.addEventListener('updateend', this._feedPlayer);
    this.mediaSource.removeEventListener('sourceopen', this._onSourceOpen);
    this._feedPlayer();
  };

  _feedPlayer = (_, segment = null) => {
    if (!this.sourceBuffer) {
      log.info('Source buffer not ready');
      if (segment) {
        this.segmentQ.push(segment);
      }
      return;
    }
    if (this.initHeader) {
      log.info('Appending initialization header');
      assert(!this.wroteInitHeader);
      this._appendSegment(this.initHeader);
      this.initHeader = null;
      this.wroteInitHeader = true;
      if (segment) {
        this.segmentQ.push(segment);
      }
      return;
    }
    if (!this.wroteInitHeader) {
      log.info('Waiting for initialization header to be written');
      if (segment) {
        this.segmentQ.push(segment);
      }
      return;
    }
    if (segment || this.segmentQ.length) {
      this._appendSegment(segment);
    }
  };

  _appendSegment(segment) {
    assert(this.sourceBuffer);

    if (segment) {
      this.segmentQ.push(segment);
    }

    let index = 0;
    for (; index < this.segmentQ.length; index++) {
      const seg = this.segmentQ[index];
      try {
        log.debug('Appending segment', seg);
        this.sourceBuffer.appendBuffer(seg);
      } catch(err) {
        if (err.name === 'QuotaExceededError' ||
            err.name === 'InvalidStateError') {
          // Full, bail out and save the rest for later.
          log.warn('SourceBuffer is full, will retry later', err);
          break;
        }
        log.error(err);
        throw err;
      }
    }

    if (index) {
      this.segmentQ.splice(0, index);
    }
  }

  _onLoadedData = () => {
    this.loadedData = true;
    this._updateCanvasSize();
  };

  _onTimeUpdate = () => {
    this._renderCanvas();
  };

  _renderCanvas() {
    requestAnimationFrame(() => {
      const canvas = this.canvas;
      const context = this.context;

      context.save();
      context.scale(this.pixelRatio, this.pixelRatio);

      try {
        this._renderCanvasInternal(context,
                                   canvas.width / this.pixelRatio,
                                   canvas.height / this.pixelRatio);
      } catch(err) {
        log.warn(err);
      }

      context.restore();
    });
  }

  _renderCanvasInternal(context, canvasWidth, canvasHeight) {
    const camera = this.state.camera;
    const online = this.renderedOnline = camera ? camera.online : false;
    const defaultFont = '16px DINRound';

    if (!camera || !online) {
      context.fillStyle = 'gray';
      context.fillRect(0, 0, canvasWidth, canvasHeight);

      if (camera && !online) {
        context.fillStyle = 'white';
        context.textAlign = 'end';
        context.textBaseline = 'top';
        context.font = '16px sans-serif';
        context.fillText('Offline', canvasWidth - 5, 5);
      }

      return;
    }

    if (!this.loadedData) {
      context.fillStyle = 'lightgray';
      context.fillRect(0, 0, canvasWidth, canvasHeight);

      // TODO: Add a spinner? Some kind of 'loading' text?
      return;
    }

    context.font = defaultFont;
    context.clearRect(0, 0, canvasWidth, canvasHeight);

    // Draw objects.
    const time =
      this.videoStartTime + Math.floor(this.video.currentTime * 1000);
    const objects = camera.objects.collect(time - 50, time + 50);
    if (objects.length) {
      const objectColors = [
        colors.blueGray,
        colors.darkBlue,
        colors.green,
        colors.red,
        colors.orange,
      ];

      // There is no way to measure text height with canvas alone... Hardcode!
      const tagHeight = 20;

      const xTagPadding = 5;
      const yTagPadding = 2;

      context.lineWidth = 3;
      context.textAlign = 'start';
      context.textBaseline = 'top';

      // All objects are scaled to the previewSize so we have to expand to fill
      // the window.
      const xScale = canvasWidth / camera.previewSize.width;
      const yScale = canvasHeight / camera.previewSize.height;

      objects.forEach((object, index) => {
        const label = object.name || object.tag;

        if (object.tag === 'motion' && !this.state.showMotionEvents) {
          return;
        }

        const colorIndex = label ?
                           asciiSum(label) % objectColors.length :
                           index % objectColors.length;
        const color = objectColors[colorIndex];
        const textColor = colorIndex === 0 ? 'black' : 'white';

        context.strokeStyle = color;

        object.rects.forEach((rect) => {
          const x = Math.round(rect.x * xScale);
          const y = Math.round(rect.y * yScale);
          const w = Math.round(rect.width * xScale);
          const h = Math.round(rect.height * yScale);

          context.strokeRect(x, y, w, h);

          if (label) {
            const wTag =
              Math.round(context.measureText(label).width) + 2 * xTagPadding;
            const hTag = tagHeight + 2 * yTagPadding;

            const xTag = (x + wTag <= canvasWidth) ?
                         x :
                         canvasWidth - wTag;
            const yTag = (y + h + hTag <= canvasHeight) ?
                         y + h :
                         y - hTag;

            context.fillStyle = color;
            context.fillRect(xTag, yTag, wTag, hTag);

            // A simple strokeRect() for the tag looks bad when we have less
            // than total opacity because it redraws one segment that was
            // already drawn by the strokeRect() call above and it becomes more
            // opaque than the other segments... Use a path instead.
            context.beginPath();
            if (yTag < y) {
              context.moveTo(xTag, yTag + hTag);
              context.lineTo(xTag, yTag);
              context.lineTo(xTag + wTag, yTag);
              context.lineTo(xTag + wTag, yTag + hTag);
            } else {
              context.moveTo(xTag, yTag);
              context.lineTo(xTag, yTag + hTag);
              context.lineTo(xTag + wTag, yTag + hTag);
              context.lineTo(xTag + wTag, yTag);
            }
            context.stroke();

            context.fillStyle = textColor;
            context.fillText(label, xTag + xTagPadding, yTag + yTagPadding);
          }
        });
      });
    }
  }

  render() {
    let console;
    if (this.state.camera &&
        this.state.camera.online &&
        this.state.consoleMessages.length) {
      const messages = this.state.consoleMessages.map((message) => {
        return (
          <li>{message.text}</li>
        );
      });
      console = (
        <div style={styles.consoleContainer}>
          <h2 style={styles.consoleHeader}>Events</h2>
          <ul style={styles.consoleMessages}>{messages}</ul>
        </div>
      );
    }
    return (
      <div style={styles.global}>
        <h1 style={styles.header}>Silk Labs</h1>
        <div style={styles.videoContainer}>
          <video
            autoPlay="true"
            style={styles.video}
            ref="video"
            onLoadedData={this._onLoadedData}
            onResize={this._updateCanvasSize}
            onTimeUpdate={this._onTimeUpdate}
          />
          <canvas
            style={styles.canvas}
            ref="canvas">
          </canvas>
          {console}
        </div>
        <form style={styles.form}>
          <Input
            type="checkbox"
            label="Show Motion Events"
            ref="checkMotion"
            checked={this.state.showMotionEvents}
            onChange={this._onMotionCheck}
          />
        </form>
      </div>
    );
  }
}
