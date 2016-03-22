import invariant from 'assert';
import React from 'react';
import { Input, Button } from 'react-bootstrap';
import ReactDOM from 'react-dom';
import createLog from 'silk-log';

import MSEPlayerWithStats from './MSEPlayerWithStats';
import Cameras from '../libraries/Cameras';
import * as CanvasUtils from '../libraries/CanvasUtils';

const log = createLog('CameraVideoMSE');

const desiredFramesPerSecond = 60;
const desiredFrameDurationMs = 1000 / desiredFramesPerSecond;
const desiredFrameDurationCeilingMs = Math.ceil(desiredFrameDurationMs);

// Reduce to 80% to avoid accidentally waiting for two frames.
const minimumFrameDurationMs = Math.floor(desiredFrameDurationMs * 0.8);

const maxStatsUpdateIntervalMs = 250;

const styles = {
  global: {
    fontFamily: 'DINRound',
    color: 'white',
    width: '100%',
    paddingBottom: '8px',
    marginBottom: '-8px',
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
  videoStats: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    padding: 10,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  videoStatsList: {
    margin: 0,
    padding: '0px 8px 8px 8px',
    listStyleType: 'none',
  },
  videoStatsItem: {
    marginTop: 10,
    marginBottom: 10,
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
  debugMenu: {
    backgroundColor: 'rgba(0,0,0,0.5)',
    padding: '10px',
    margin: '6px',
  },
  debugButton: {
    marginRight: '8px',
  },
};

function capitalize(string) {
  return string.charAt(0).toUpperCase() + string.substr(1).toLowerCase();
}

function formatTimestamp(when) {
  let date = new Date(when);
  return date.toLocaleTimeString();
}

function formatMs(number) {
  return `${(number / 1000).toFixed(2)}s`;
}

function formatDeltaMs(number) {
  if (number > 0) {
    return '+' + formatMs(number);
  }
  return formatMs(number);
}

export default class CameraVideo extends React.Component {
  canvas = null;
  context = null;
  pixelRatio = 1;

  videoStartTimestampDevice = null;
  loadedData = false;
  animationToken = null;

  // Used for rate limiting.
  lastAnimationTimestamp = null;

  // Used to prevent redundant drawing and early object expiration.
  lastRenderedVideoTimestamp = null;
  lastRenderedCamera = null;
  lastRenderedOnline = null;

  currentAnimationFrameTimestamp = null;

  segmentsDroppedMs = 0;
  dropNextSegment = false;

  state = {
    camera: null,
    cameraOnline: false,
    consoleMessages: [],
    faceCount: 0,
    showMotionEvents: false,
    showVideoStats: false,
    stats: null,
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
    if (!this.state.camera) {
      this.videoStartTimestampDevice = null;
      this.loadedData = false;
      this.lastRenderedVideoTimestamp = null;
      this.lastRenderedCamera = null;
      this.lastRenderedOnline = null;
    }
    if (!this.state.camera || !this.state.cameraOnline) {
      this._stopAnimationLoop();
    }
    if (this.state.camera !== prevState.camera) {
      this._updateCanvasSize();
    } else if (this.state.cameraOnline !== prevState.cameraOnline) {
      this._redrawCanvas();
    }
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

  _runInAnimationFrame(func) {
    if (this.currentAnimationFrameTimestamp) {
      func();
      return;
    }
    requestAnimationFrame((now) => {
      this.currentAnimationFrameTimestamp = now;
      func();
      this.currentAnimationFrameTimestamp = null;
    });
  }

  _setStateAsync(state) {
    this._runInAnimationFrame(() => this.setState(state));
  }

  _updateCanvasSize = () => {
    this._runInAnimationFrame(this._updateCanvasSizeInternal);
  };

  _updateCanvasSizeInternal = () => {
    invariant(this.currentAnimationFrameTimestamp);

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

    this._redrawCanvas();
  };

  _onCamerasStateChanged = state => {
    const oldCamera = this.state.camera;
    const newCamera = state.cameras[this.deviceId];

    if (oldCamera === newCamera) {
      if (this.state.cameraOnline !== newCamera.online) {
        this._setStateAsync({cameraOnline: newCamera.online});
      }
      return;
    }

    if (oldCamera) {
      oldCamera.removeListener('videoClip', this._onNextVideoClip);
    }

    if (newCamera) {
      newCamera.addListener('videoClip', this._onNextVideoClip);
    }

    this._setStateAsync({
      camera: newCamera || null,
      cameraOnline: newCamera ? newCamera.online : false,
    });
  };

  _onNextVideoClip = (segmentData, when) => {
    if (this.videoStartTimestampDevice === null) {
      this.videoStartTimestampDevice = when;
    }
    if (this.dropNextSegment) {
      log.debug('Dropping this segment.');
      this.dropNextSegment = false;
      return;
    }
    this.refs.msePlayer.feedSegmentData(segmentData, when);
  };

  _onMotionEventsCheck = () => {
    const showMotionEvents = this.refs.checkMotion.getChecked();
    if (showMotionEvents === this.state.showMotionEvents) {
      return;
    }
    this._setStateAsync({showMotionEvents});
  };

  _onVideoStatsCheck = () => {
    const showVideoStats = this.refs.checkVideoStats.getChecked();
    if (showVideoStats === this.state.showVideoStats) {
      return;
    }
    this._setStateAsync({showVideoStats});
  };

  _onLoadedData = () => {
    this.loadedData = true;
    this._redrawCanvas();
  };

  _redrawCanvas() {
    this._runInAnimationFrame(() => this._drawCanvas(false));
  }

  _drawCanvas(isAnimationLoop) {
    invariant(this.currentAnimationFrameTimestamp);

    // We don't need sub-millisecond precision.
    const now = Math.floor(this.currentAnimationFrameTimestamp);

    const {camera, cameraOnline} = this.state;
    const {animationToken} = this;

    const forceRender =
      !isAnimationLoop ||
      camera !== this.lastRenderedCamera ||
      cameraOnline !== this.lastRenderedOnline;

    // Re-render if |camera| or |cameraOnline| have changed, otherwise re-render
    // if enough time has elapsed to meet our frame rate goal.
    if (forceRender ||
        !this.lastAnimationTimestamp ||
        (now - this.lastAnimationTimestamp >= minimumFrameDurationMs)) {

      // Figure out the window of time for which we should draw objects.
      const video = this.refs.msePlayer.videoElement;
      const videoElapsedMs = Math.floor(video.currentTime * 1000);
      const videoEndTimestamp =
        this.videoStartTimestampDevice +
        videoElapsedMs +
        this.segmentsDroppedMs;

      if (forceRender ||
          videoEndTimestamp !== this.lastRenderedVideoTimestamp) {
        let videoStartTimestamp;
        if (this.lastRenderedVideoTimestamp &&
            (videoEndTimestamp - this.lastRenderedVideoTimestamp >
               desiredFrameDurationCeilingMs)) {
          videoStartTimestamp = this.lastRenderedVideoTimestamp;
        } else {
          videoStartTimestamp =
            videoEndTimestamp - desiredFrameDurationCeilingMs;
        }

        const {canvas, context, pixelRatio} = this;

        context.save();
        context.scale(pixelRatio, pixelRatio);

        try {
          this._drawCanvasInternal(context,
                                   canvas.width / pixelRatio,
                                   canvas.height / pixelRatio,
                                   videoStartTimestamp,
                                   videoEndTimestamp);
        } catch(err) {
          log.warn(err);
        }

        context.restore();

        this.lastRenderedCamera = camera;
        this.lastRenderedOnline = cameraOnline;
        this.lastRenderedVideoTimestamp = videoEndTimestamp;
        this.lastAnimationTimestamp = now;
      }
    }

    // Request another animation frame if that has not already happened.
    if (isAnimationLoop && animationToken === this.animationToken) {
      this._scheduleNextAnimationLoopFrame();
    }
  }

  _drawCanvasInternal(
    context,
    canvasWidth,
    canvasHeight,
    videoStartTimestamp,
    videoEndTimestamp
  ) {
    invariant(this.currentAnimationFrameTimestamp);

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
    const objects =
      this._collectAndProcessObjects(videoStartTimestamp, videoEndTimestamp);
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

    this._setStateAsync({consoleMessages: newMessages});
  }

  _startAnimationLoop = () => {
    if (this.animationToken) {
      return;
    }
    log.info('Starting animation loop');
    this._scheduleNextAnimationLoopFrame();
  };

  _scheduleNextAnimationLoopFrame() {
    this.animationToken = requestAnimationFrame((now) => {
      this.currentAnimationFrameTimestamp = now;
      this._drawCanvas(true);
      this.currentAnimationFrameTimestamp = null;
    });
  }

  _stopAnimationLoop() {
    if (!this.animationToken) {
      return;
    }
    log.info('Stopping animation loop');
    cancelAnimationFrame(this.animationToken);
    this.animationToken = null;
  }

  _onStatsUpdate = (stats) => {
    this.segmentsDroppedMs = stats.totalDroppedMs;
    if (!this.state.showVideoStats) {
      return;
    }
    requestAnimationFrame(() => this.setState({stats}));
  };

  _onReload = () => {
    this.videoStartTimestampDevice = null;
    this.segmentsDroppedMs = 0;
  };

  _renderStats() {
    if (!this.state.showVideoStats || !this.state.stats) {
      return null;
    }

    const {
      elapsedMs,
      playbackMs,
      deviceToClientLagMs,
      totalStalledMs,
      totalBufferedMs,
      totalOutOfBufferMs,
      totalDroppedMs,
      reloadCount,
    } = this.state.stats;
    return (
      <div style={styles.videoStats}>
        <ul style={styles.videoStatsList}>
          <li style={styles.videoStatsItem}>
            Time:<br/>
            {formatMs(elapsedMs)} elapsed<br/>
            {formatMs(playbackMs)} {' <video> '}
            ({formatDeltaMs(playbackMs - elapsedMs)})<br/>
            {formatTimestamp(this.videoStartTimestampDevice + playbackMs + totalDroppedMs)}
            {' <video> '}
          </li>
          <li style={styles.videoStatsItem}>
            Buffer:<br/>
            {formatMs(totalBufferedMs)} buffered<br/>
            {formatMs(playbackMs)} {' <video> '}
            ({formatDeltaMs(playbackMs - totalBufferedMs)})
          </li>
          <li style={styles.videoStatsItem}>
            Lag/Stalls/Drops:<br/>
            {formatMs(deviceToClientLagMs)} lag device to client<br/>
            {formatMs(totalStalledMs)} {' <video> '} stalls (Firefox only)<br/>
            {formatMs(totalOutOfBufferMs)} out of buffer<br/>
            {formatMs(totalDroppedMs)} in segments dropped
          </li>
          <li style={styles.videoStatsItem}>
            Reload Count: {reloadCount}
          </li>
        </ul>
      </div>
    );
  }

  _renderDebugMenu() {
    return (
      <form style={styles.debugMenu}>
        <h3>Debug Options</h3>
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
        <Button
          style={styles.debugButton}
          onClick={() => this.refs.msePlayer.forceReload()}>
          Reload &lt;video&gt; element
        </Button>
        <Button
          style={styles.debugButton}
          onClick={() => this.dropNextSegment = true}>
          Drop next segment
        </Button>
      </form>
    );
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

    let stats = null;
    if (this.state.showVideoStats) {
      stats = this._renderStats();
    }

    let msePlayer = null;
    if (this.state.camera) {
      msePlayer = (
        <MSEPlayerWithStats
          ref="msePlayer"
          key={this.state.camera.id}
          maxStatsUpdateIntervalMs={maxStatsUpdateIntervalMs}
          autoPlay="true"
          style={styles.video}
          onStatsUpdate={this._onStatsUpdate}
          onLoadedMetadata={this._updateCanvasSize}
          onLoadedData={this._onLoadedData}
          onResize={this._updateCanvasSize}
          onPlaying={this._startAnimationLoop}
          onReload={this._onReload}
        />
      );
    }

    return (
      <div style={styles.global}>
        <h1 style={styles.header}>Silk Labs</h1>
        <div style={styles.videoContainer}>
          {msePlayer}
          {console}
          {stats}
          <canvas
            style={styles.canvas}
            ref="canvas">
          </canvas>
        </div>
        {this._renderDebugMenu()}
      </div>
    );
  }
}
