import invariant from 'assert';
import React from 'react';
import { Input } from 'react-bootstrap';
import ReactDOM from 'react-dom';
import createLog from 'silk-log';

import MSEPlayerWithStats from './MSEPlayerWithStats';
import Cameras from '../libraries/Cameras';
import * as CanvasUtils from '../libraries/CanvasUtils';

const log = createLog('CameraVideoMSE');

const desiredFramesPerSecond = 60;
const desiredFrameDurationMs = 1000 / desiredFramesPerSecond;

// Reduce to 80% to avoid accidentally waiting for two frames.
const minimumFrameDurationMs = Math.floor(desiredFrameDurationMs * 0.8);

const styles = {
  global: {
    fontFamily: 'DINRound',
    color: 'white',
    width: '100%',
    height: '100%',
    backgroundColor: CanvasUtils.colors.red,
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
    padding: 5,
    fontSize: '20px',
  },
  consoleMessages: {
    margin: 0,
    padding: 5,
    listStyleType: 'none',
  },
  consoleSeparator: {
    backgroundColor: 'rgba(0,0,0,0.25)',
    width: '100%',
    height: 2,
  },
  consoleFaceCount: {
    margin: 0,
    padding: 5,
  },
  videoContainer: {
    position: 'relative',
    borderStyle: 'solid',
    borderColor: CanvasUtils.colors.red,
    borderWidth: '0px 6px',
  },
  video: {
    display: 'block',
    width: '100%',
    pointerEvents: 'none',
    backgroundColor: CanvasUtils.colors.darkGray,
  },
  canvas: {
    position: 'absolute',
    top: 0,
    left: 0,
    pointerEvents: 'none',
  },
  form: {
    backgroundColor: CanvasUtils.colors.red,
    padding: '1px 8px 1px 8px',
    margin: 0,
    textAlign: 'right',
  },
};

function capitalize(string) {
  return string.charAt(0).toUpperCase() + string.substr(1).toLowerCase();
}

function formatTimestamp(when) {
  let date = new Date(when);
  return date.toLocaleTimeString();
}

export default class CameraVideo extends React.Component {
  canvas = null;
  context = null;
  pixelRatio = 1;

  videoStartTimestampDevice = null;
  loadedData = false;
  animationToken = null;
  lastAnimationTimestamp = null;

  state = {
    camera: null,
    cameraOnline: false,
    consoleMessages: [],
    faceCount: 0,
    showMotionEvents: false,
    showVideoStats: false,
  };

  get deviceId() {
    return this.props.params.deviceId;
  }

  componentDidMount() {
    this.canvas = ReactDOM.findDOMNode(this.refs.canvas);
    this.context = this.canvas.getContext('2d');
    window.addEventListener('resize', this._updateCanvasSize);
    this._updateCanvasSize();

    const devicePixelRatio = window.devicePixelRatio || 1;
    const backingRatio = this.context.webkitBackingStorePixelRatio || 1;
    if (devicePixelRatio !== backingRatio) {
      this.pixelRatio = devicePixelRatio / backingRatio;
    }

    Cameras.on('stateChanged', this._onCamerasStateChanged);
    this._onCamerasStateChanged(Cameras);
  }

  componentDidUpdate(prevProps, prevState) {
    if (!this.state.camera && prevState.camera) {
      this.videoStartTimestampDevice = null;
      this.loadedData = false;
    }
    if (!this.state.camera || !this.state.cameraOnline) {
      this._stopAnimationLoop();
    }
    this._updateCanvasSize();
  }

  componentWillUnmount() {
    Cameras.removeListener('stateChanged', this._onCamerasStateChanged);
    const camera = this.state.camera;
    if (camera) {
      camera.removeListener('videoClip', this._onNextVideoClip);
    }
    window.removeEventListener('resize', this._updateCanvasSize);
    this._stopAnimationLoop();
  }

  _updateCanvasSize = () => {
    if (!this.refs.msePlayer) {
      this.canvas.style.display = 'none';
      return;
    }
    this.canvas.style.display = 'inherit';
    const video = this.refs.msePlayer.videoElement;
    let width = video.clientWidth;
    let height = video.clientHeight;

    if (this.pixelRatio !== 1) {
      this.canvas.style.width = Math.floor(width) + 'px';
      this.canvas.style.height = Math.floor(height) + 'px';

      width *= this.pixelRatio;
      height *= this.pixelRatio;
    }

    this.canvas.width = Math.floor(width);
    this.canvas.height = Math.floor(height);

    this._rerenderCanvas();
  };

  _onCamerasStateChanged = state => {
    const oldCamera = this.state.camera;
    const newCamera = state.cameras[this.deviceId];

    if (oldCamera === newCamera) {
      if (this.state.cameraOnline !== newCamera.online) {
        this.setState({
          cameraOnline: newCamera.online,
        });
      }
      return;
    }

    if (oldCamera) {
      oldCamera.removeListener('videoClip', this._onNextVideoClip);
    }

    if (newCamera) {
      newCamera.addListener('videoClip', this._onNextVideoClip);
    }

    this.setState({
      camera: newCamera || null,
      cameraOnline: newCamera ? newCamera.online : false,
    });
  };

  _onNextVideoClip = (segmentData, when) => {
    if (this.videoStartTimestampDevice === null) {
      this.videoStartTimestampDevice = when;
    }
    this.refs.msePlayer.feedSegmentData(segmentData, when);
  };

  _onMotionEventsCheck = () => {
    const showMotionEvents = this.refs.checkMotion.getChecked();
    if (showMotionEvents === this.state.showMotionEvents) {
      return;
    }
    requestAnimationFrame((now) => {
      this.setState({showMotionEvents});
      if (!this.animationToken) {
        this._renderCanvas(now);
      }
    });
  };

  _onVideoStatsCheck = () => {
    const showVideoStats = this.refs.checkVideoStats.getChecked();
    if (showVideoStats === this.state.showVideoStats) {
      return;
    }
    requestAnimationFrame(() => {
      this.setState({showVideoStats});
    });
  };

  _onLoadedData = () => {
    this.loadedData = true;
    this._rerenderCanvas();
  };

  _rerenderCanvas() {
    // Only request an animation frame if that was not scheduled already, and
    // don't set |animationToken| so that we don't mistakenly think that we
    // should be running the animation loop.
    if (!this.animationToken) {
      requestAnimationFrame(this._renderCanvas);
    }
  }

  _renderCanvas = (now) => {
    const {camera, cameraOnline: online} = this.state;
    invariant(now);

    // We don't need sub-millisecond precision.
    now = Math.round(now);

    const {animationToken, canvas, context, pixelRatio} = this;

    if (!camera ||
        !online ||
        !this.lastAnimationTimestamp ||
        (now - this.lastAnimationTimestamp >= minimumFrameDurationMs)) {
      context.save();
      context.scale(pixelRatio, pixelRatio);

      try {
        this._renderCanvasInternal(context,
                                   canvas.width / pixelRatio,
                                   canvas.height / pixelRatio,
                                   now);
      } catch(err) {
        log.warn(err);
      }

      context.restore();

      if (camera && online) {
        this.lastAnimationTimestamp = now;
      }
    }

    // Request another animation frame if that has not already happened.
    if (animationToken && animationToken === this.animationToken) {
      invariant(camera && online);
      this.animationToken = requestAnimationFrame(this._renderCanvas);
    }
  };

  _renderCanvasInternal(context, canvasWidth, canvasHeight, now) {
    const {camera, cameraOnline: online} = this.state;
    const defaultFont = '16px DINRound';

    context.clearRect(0, 0, canvasWidth, canvasHeight);

    if (!camera || !online) {
      context.fillStyle = CanvasUtils.colors.transparentDarkGray;
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
      context.fillStyle = CanvasUtils.colors.transparentGray;
      context.fillRect(0, 0, canvasWidth, canvasHeight);

      // TODO: Add a spinner? Some kind of 'loading' text?
      return;
    }

    context.font = defaultFont;

    // Draw objects.
    const video = this.refs.msePlayer.videoElement;
    const currentVideoTimeMs = Math.round(video.currentTime * 1000);
    const timeEnd =
      this.videoStartTimestampDevice + currentVideoTimeMs;
    const timeDiff =
      this.lastAnimationTimestamp ?
      (now - this.lastAnimationTimestamp) :
      (timeEnd - Math.floor(desiredFrameDurationMs));

    const objects = this._collectAndProcessObjects(timeEnd - timeDiff, timeEnd);
    if (objects.length) {
      const drawArgs = {
        context,
        container: {
          width: canvasWidth,
          height: canvasHeight,
        },
        // There is no way to measure text height with canvas alone... Hardcode!
        labelHeight: 20,
        labelPaddingX: 5,
        labelPaddingY: 2,
      };

      context.lineWidth = 3;
      context.textAlign = 'start';
      context.textBaseline = 'top';

      // All objects are scaled to the objectsSize so we have to expand to fill
      // the window.
      const xScale = canvasWidth / camera.objectsSize.width;
      const yScale = canvasHeight / camera.objectsSize.height;

      objects.forEach((object, index) => {
        if (!object.rects.length) {
          return;
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
    }
  }

  _collectAndProcessObjects(timeStart, timeEnd) {
    invariant(this.state.camera);

    const objects = [];

    // Collect all objects that should be present in this time window.
    const objectMap = this.state.camera.objects.collect(timeStart, timeEnd);
    if (!objectMap.size) {
      return objects;
    }

    let consoleMessageObjects;
    let faceCount = 0;

    objectMap.forEach((objectArray, objectId) => {
      const firstObject = objectArray[0];
      const tag = firstObject.tag;

      // Draw all motion rects if that option is enabled.
      if (tag === 'motion') {
        if (this.state.showMotionEvents) {
          objectArray.forEach((object) => {
            objects.push(object);
          });
        }
        return;
      }

      // Collect all the rects for non-motion objects with the same id.
      const averageObject = objectArray.reduce((result, object) => {
        if ('name' in object) {
          result.name = object.name;
        }
        if (object.rects.length) {
          result.rects = result.rects.concat(object.rects);
        }
        return result;
      }, {
        id: objectId,
        source: firstObject.source,
        tag,
        when: firstObject.when,
        rects: [],
      });

      const rectCount = averageObject.rects.length;
      if (!rectCount || tag === 'face') {
        consoleMessageObjects = consoleMessageObjects || [];
        consoleMessageObjects.push(averageObject);

        if (tag === 'face') {
          faceCount++;
        }
      }

      if (!rectCount) {
        return;
      }

      // Average all the rects.
      if (rectCount > 1) {
        const averageRect = averageObject.rects.reduce((result, rect) => {
          result.x += rect.x;
          result.y += rect.y;
          result.width += rect.width;
          result.height += rect.height;
          return result;
        }, {
          x: 0,
          y: 0,
          width: 0,
          height: 0,
        });
        averageRect.x = Math.round(averageRect.x / rectCount);
        averageRect.y = Math.round(averageRect.y / rectCount);
        averageRect.width = Math.round(averageRect.width / rectCount);
        averageRect.height = Math.round(averageRect.height / rectCount);

        averageObject.rects = [averageRect];
      }

      // Only push a single object.
      objects.push(averageObject);
    });

    // Figure out any text we should display for the console.
    if (consoleMessageObjects) {
      this._processConsoleMessageObjects(consoleMessageObjects);
    }

    if (this.state.faceCount !== faceCount) {
      requestAnimationFrame(() => {
        this.setState({
          faceCount,
        });
      });
    }

    return objects;
  }

  _processConsoleMessageObjects(objects) {
    const oldMessages = this.state.consoleMessages;
    let newMessages;

    objects.forEach((object) => {
      let text;
      if (object.tag === 'face') {
        if ('name' in object) {
          text = capitalize(object.name);
        } else {
          text = 'A face';
        }
        text += ' was seen';
      } else if ('text' in object) {
        text = object.text;
      } else if ('name' in object) {
        text = capitalize(object.name) + '!';
      } else {
        text = capitalize(object.tag) + '!';
      }
      if (oldMessages.some((oldMessage) => {
        return oldMessage.id === object.id && oldMessage.text === text;
      })) {
        // An indentical message for this object id is already displayed.
        return;
      }
      newMessages = newMessages || oldMessages.slice();
      newMessages.push({
        id: object.id,
        text,
        when: object.when,
      });
    });

    if (!newMessages) {
      return;
    }

    newMessages.sort((a, b) => {
      return (a.when < b.when) ? -1 : ((a.when === b.when) ? 0 : 1);
    });

    if (newMessages.length > 4) {
      newMessages.splice(0, newMessages.length - 4);
    }

    // Change the state on the next frame to make sure we don't take too
    // long here.
    requestAnimationFrame(() => {
      this.setState({
        consoleMessages: newMessages,
      });
    });
  }

  _startAnimationLoop() {
    if (this.animationToken) {
      return;
    }
    log.info('Starting animation loop');
    this.animationToken = requestAnimationFrame(this._renderCanvas);
  }

  _stopAnimationLoop() {
    if (!this.animationToken) {
      return;
    }
    log.info('Stopping animation loop', this.animationToken);
    cancelAnimationFrame(this.animationToken);
    this.animationToken = null;
    this.lastAnimationTimestamp = null;
  }

  _onVideoEvent = (event) => {
    const {type} = event;
    log.debug(`Video '${type}' event`);

    if (type === 'playing') {
      this._startAnimationLoop();
      return;
    }

    this._stopAnimationLoop();
  }

  render() {
    let console = null;
    if (this.state.camera &&
        this.state.cameraOnline &&
        (this.state.consoleMessages.length || this.state.faceCount)) {
      let consoleMessages = null;
      if (this.state.consoleMessages.length) {
        const messages =
          this.state.consoleMessages.map((message) =>
            <li>[{formatTimestamp(message.when)}] {message.text}</li>);
        consoleMessages = (
          <div>
            <h2 style={styles.consoleHeader}>Events</h2>
            <ul style={styles.consoleMessages}>
              {messages}
            </ul>
          </div>
        );
      }

      let faceCount = null;
      if (this.state.faceCount) {
        const text = `${this.state.faceCount} face` +
                     `${(this.state.faceCount > 1 ? 's' : '')} detected`;
        faceCount = (
          <p style={styles.consoleFaceCount}>
            {text}
          </p>
        );
      }

      let separator = null;
      if (consoleMessages && faceCount) {
        separator = (
          <div style={styles.consoleSeparator}></div>
        );
      }

      console = (
        <div style={styles.consoleContainer}>
          {consoleMessages}
          {separator}
          {faceCount}
        </div>
      );
    }

    let msePlayer = null;
    if (this.state.camera) {
      msePlayer = (
        <MSEPlayerWithStats
          ref="msePlayer"
          key={this.state.camera.id}
          showStats={this.state.showVideoStats}
          autoPlay="true"
          style={styles.video}
          onLoadedMetadata={this._updateCanvasSize}
          onLoadedData={this._onLoadedData}
          onResize={this._updateCanvasSize}
          onStalled={this._onVideoEvent}
          onSuspend={this._onVideoEvent}
          onWaiting={this._onVideoEvent}
          onPlaying={this._onVideoEvent}
          onPause={this._onVideoEvent}
          onEnded={this._onVideoEvent}
        />
      );
    }

    return (
      <div style={styles.global}>
        <h1 style={styles.header}>Silk Labs</h1>
        <div style={styles.videoContainer}>
          {msePlayer}
          {console}
          <canvas
            style={styles.canvas}
            ref="canvas">
          </canvas>
        </div>
        <form style={styles.form}>
          <Input
            type="checkbox"
            label="Show Motion Events"
            ref="checkMotion"
            checked={this.state.showMotionEvents}
            onChange={this._onMotionEventsCheck}
          />
          <Input
            type="checkbox"
            label="Show Video Stats"
            ref="checkVideoStats"
            checked={this.state.showVideoStats}
            onChange={this._onVideoStatsCheck}
          />
        </form>
      </div>
    );
  }
}
