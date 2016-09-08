import invariant from 'assert';
import React from 'react';
import ReactCSSTransitionGroup from 'react-addons-css-transition-group';
import { Input, ButtonInput } from 'react-bootstrap';
import ReactDOM from 'react-dom';
import { MSEPlayerWithStats } from 'silk-mse-player';
import createLog from 'silk-log';

import Cameras from '../libraries/Cameras';
import * as CanvasUtils from '../libraries/CanvasUtils';

const log = createLog('CameraVideoMSE');

const desiredFramesPerSecond = 60;
const desiredFrameDurationMs = 1000 / desiredFramesPerSecond;
const desiredFrameDurationCeilingMs = Math.ceil(desiredFrameDurationMs);

// Reduce to 80% to avoid accidentally waiting for two frames.
const minimumFrameDurationMs = Math.floor(desiredFrameDurationMs * 0.8);

const maxStatsUpdateIntervalMs = 250;
const clogDurationMs = 2000;

const consoleMessageEntryCount = 6;

const characters = [
  'casey',
  'jaime',
  'riley',
  'avery',
  'kerry',
  'jessie',
];
let nextCharacterIndex = Math.floor(Math.random() * 1000 % characters.length);

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
    height: 20 * consoleMessageEntryCount,
    marginBottom: 10,
    paddingLeft: 5,
    paddingRight: 5,
    listStyleType: 'none',
    overflow: 'hidden',
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
  debugMenuForm: {
    paddingBottom: '10px',
  },
  debugMenuFormGroup: {
    marginBottom: '0px',
    marginRight: '15px',
  },
};

function capitalize(string) {
  return string.charAt(0).toUpperCase() + string.substr(1).toLowerCase();
}

function formatTimestamp(when) {
  let date = new Date(when);
  return date.toLocaleTimeString();
}

function formatConsoleTimestamp(when) {
  let date = new Date(when);
  return date.toLocaleTimeString('en-US').slice(0, -3); // remove AM/PM
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
  clogQueue = null;

  faceIdNameMap = new Map();
  trackedObjects = new Map();

  state = {
    camera: null,
    cameraOnline: false,
    consoleMessages: [],
    faceCount: 0,
    showMotionEvents: false,
    showFaces: true,
    showVideoStats: false,
    stats: null,
    muted: true,
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

  _onActiveCameraStateChanged = () => {
    const online = this.state.camera.online;
    if (this.state.cameraOnline !== online) {
      this._setStateAsync({cameraOnline: online});
    }
  }

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
      oldCamera.removeListener('stateChanged', this._onActiveCameraStateChanged);
    }

    if (newCamera) {
      newCamera.addListener('videoClip', this._onNextVideoClip);
      newCamera.addListener('stateChanged', this._onActiveCameraStateChanged);
    }

    this._setStateAsync({
      camera: newCamera || null,
      cameraOnline: newCamera ? newCamera.online : false,
    });
  };

  _onNextVideoClip = (segmentDataOrBlob, when) => {
    if (this.videoStartTimestampDevice === null) {
      this.videoStartTimestampDevice = when;
    }
    if (this.dropNextSegment) {
      log.debug('Dropping this segment.');
      this.dropNextSegment = false;
      return;
    }

    if (segmentDataOrBlob instanceof ArrayBuffer) {
      // socket.io still sends ArrayBuffer
      this._feedSegmentData(segmentDataOrBlob, when);
      return;
    }
    const reader = new FileReader();
    reader.readAsArrayBuffer(segmentDataOrBlob);
    reader.onloadend = () => this._feedSegmentData(reader.result, when);
  };

  _feedSegmentData(segmentData, when) {
    if (this.clogQueue) {
      log.debug(`Network is "clogged".`);
      this.clogQueue.push({segmentData, when});
      return;
    }
    this.refs.msePlayer.feedSegmentData(segmentData, when);
  }

  _onMotionEventsCheck = () => {
    const showMotionEvents = this.refs.checkMotion.getChecked();
    if (showMotionEvents === this.state.showMotionEvents) {
      return;
    }
    this._setStateAsync({showMotionEvents});
  };

  _onFacesCheck = () => {
    const showFaces = this.refs.checkFaces.getChecked();
    if (showFaces !== this.state.showFaces) {
      this._setStateAsync({showFaces});
    }
  };

  _onVideoStatsCheck = () => {
    const showVideoStats = this.refs.checkVideoStats.getChecked();
    if (showVideoStats === this.state.showVideoStats) {
      return;
    }
    this._setStateAsync({showVideoStats});
  };

  _onVideoMutedCheck = () => {
    const muted = this.refs.checkMuted.getChecked();
    if (muted === this.state.muted) {
      return;
    }
    this._setStateAsync({muted});
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
        } catch (err) {
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

        let label;
        if (object.tag === `face`) {
          label = capitalize(this._getFaceName(object));
        } else {
          label = object.name || object.tag || null;
        }

        const colors =
          CanvasUtils.colorsForLabel(label || index.toString());

        if (object.tag === `face` &&
            ((!(`faceId` in object)) || object.faceId === null) &&
            `percentTrained` in object &&
            object.percentTrained > 30) {
          label += ` (${object.percentTrained}%)`;
        }

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
    const objectMap = this.state.camera.objects === null ? [] :
      this.state.camera.objects.collect(timeStart, timeEnd);
    const consoleMessageObjects = [];

    objectMap.forEach((objectArray, objectId) => {
      const lastObject = objectArray[objectArray.length - 1];
      const tag = lastObject.tag;

      // Draw all motion rects if that option is enabled.
      if (tag === 'motion') {
        if (this.state.showMotionEvents) {
          objectArray.forEach((object) => {
            objects.push(object);
          });
        }
        return;
      }

      const rectCount =
        objectArray.reduce((result, object) => result + object.rects.length, 0);
      if (!rectCount || tag === 'face') {
        consoleMessageObjects.push(lastObject);
        if (!rectCount || !this.state.showFaces) {
          return;
        }
      }

      objects.push(lastObject);
    });

    // Figure out any text we should display for the console.
    this._processConsoleMessageObjects(consoleMessageObjects);

    return objects;
  }

  _processConsoleMessageObjects(objects) {
    const oldMessages = this.state.consoleMessages;
    let newMessages;

    // Make sure we know when previously tracked objects are no longer around.
    const expiredTrackedObjects =
      this.trackedObjects.size ? new Set(this.trackedObjects.keys()) : null;

    objects.forEach((object) => {
      // Don't expire objects that we're still seeing.
      if (expiredTrackedObjects) {
        expiredTrackedObjects.delete(object.id);
      }

      const text = this._formatConsoleMessage(object, /* visible */ true);
      if (!oldMessages.some((oldMessage) =>
            oldMessage.id === object.id && oldMessage.text === text)) {
        // Either there is no message in the console with this id or the text is
        // not the same.
        newMessages = newMessages || oldMessages.slice();
        newMessages.push({
          id: object.id,
          text,
          when: object.when,
        });
      }

      // Don't track some kinds of objects.
      if (object.tag === `devicemotion` || object.tag === `sound`) {
        return;
      }

      if (!this.trackedObjects.get(object.id)) {
        log.debug(`Starting to track object`, object);
      }
      this.trackedObjects.set(object.id, object);
    });

    // Add messages for all expired objects.
    if (expiredTrackedObjects) {
      expiredTrackedObjects.forEach((id) => {
        const object = this.trackedObjects.get(id);
        log.debug(`No longer tracking object`, object);

        const text = this._formatConsoleMessage(object, /* visible */ false);

        newMessages = newMessages || oldMessages.slice();
        newMessages.push({
          id,
          text,
          when: object.when + object.durationMs,
        });

        this.trackedObjects.delete(id);
      });
    }

    // Update the face count.
    let faceCount = 0;
    this.trackedObjects.forEach((object) => {
      if (object.tag === `face`) {
        faceCount++;
      }
    });

    // Maybe update state if something has changed.
    let newState;

    if (newMessages) {
      newMessages.sort((a, b) => {
        return (a.when < b.when) ? -1 : ((a.when === b.when) ? 0 : 1);
      });

      if (newMessages.length > consoleMessageEntryCount - 1) {
        newMessages.splice(0, newMessages.length - consoleMessageEntryCount - 1);
      }

      log.debug(`New console messages`, newMessages);
      newState = newState || {};
      newState.consoleMessages = newMessages;
    }

    if (this.state.faceCount !== faceCount) {
      newState = newState || {};
      newState.faceCount = faceCount;
    }

    if (newState) {
      this._setStateAsync(newState);
    }
  }

  _formatConsoleMessage(object, visible) {
    switch (object.tag) {
    case `face`:
      return this._formatConsoleMessageFace(object, visible);
    case `sound`:
      return this._formatConsoleMessageSound(object, visible);
    case `object`:
      return this._formatConsoleMessageObject(object, visible);
    case `device moved`:
      return `Device moved.`;
    default:
      log.warn(`No special console message formatter for object`, object);
    }
    return object.name || object.tag;
  }

  _getFaceName(object) {
    if (object.faceId === null) {
      return 'unrecognized';
    }

    let name = this.faceIdNameMap.get(object.faceId);
    if (!name) {
      name = characters[nextCharacterIndex];
      nextCharacterIndex = ++nextCharacterIndex % characters.length;
      this.faceIdNameMap.set(object.faceId, name);
    }
    return name;
  }

  _formatConsoleMessageFace(object, visible) {
    let name = this._getFaceName(object);

    if (name === 'unrecognized') {
      if (visible && object.movement === 'notchanged') {
        name = `an ${name} person`;
      } else {
        name = `the ${name} person`;
      }
    }

    name = capitalize(name);

    if (!visible) {
      return `${name} is gone.`;
    }

    switch (object.movement) {
    case 'notchanged':
      return `${name} is here.`;
    case 'closer':
      return `${name} is moving closer`;
    case 'farther':
      return `${name} is moving away`;
    default:
      log.warn(`Unknown movement: ${object.movement}`);
    }

    return name;
  }

  _formatConsoleMessageSound(object, visible) {
    let name;
    switch (object.name) {
    case `firealarm`:
      name = `a smoke alarm`;
      break;
    case `a clap`:
      name = object.name;
      break;
    case `glassbreak`:
      name = `glass breaking`;
      break;
    default:
      log.warn(`Unsupported sound type '${object.name}'`);
      name = object.name;
    }
    return `${(visible ? 'Heard' : 'No longer hearing')} ${name}.`;
  }

  _formatConsoleMessageObject(object, visible) {
    const name = object.name.toLowerCase();
    return visible ? `Saw a ${name}.` : `The ${name} is gone.`;
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

  _clogNetwork = () => {
    this.clogQueue = [];
    setTimeout(() => {
      log.debug(`Network is "unclogged". Found ${this.clogQueue.length} segments in queue.`);
      for (let {segmentData, when} of this.clogQueue) {
        this.refs.msePlayer.feedSegmentData(segmentData, when);
      }
      this.clogQueue = null;
    }, clogDurationMs);
  };

  _renderConsole() {
    if (!this.state.camera ||
        !this.state.cameraOnline ||
        (!this.state.consoleMessages.length && !this.state.faceCount)) {
      return null;
    }

    let consoleHeader = null;
    let consoleMessages = null;
    if (this.state.consoleMessages.length) {
      consoleHeader = (
        <h2 style={styles.consoleHeader}>Events</h2>
      );

      const scrollAnimation =
        this.state.consoleMessages.length > consoleMessageEntryCount;

      let messages =
        this.state.consoleMessages.slice(-consoleMessageEntryCount);
      messages = messages.map((message, index) =>
        <li key={(message.when + '-' + message.text + '-' + message.id)}>
          {formatConsoleTimestamp(message.when) + ' - ' + message.text}
        </li>
      );

      consoleMessages = (
        <ReactCSSTransitionGroup
          component="ul"
          transitionName="video-console-item"
          transitionAppear={true}
          transitionAppearTimeout={2000}
          transitionEnter={true}
          transitionEnterTimeout={2000}
          transitionLeave={scrollAnimation}
          transitionLeaveTimeout={300}
          style={styles.consoleMessages}>
          {messages}
        </ReactCSSTransitionGroup>
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

    return (
      <div style={styles.consoleContainer}>
        {consoleHeader}
        {consoleMessages}
        {separator}
        {faceCount}
      </div>
    );
  }

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
      totalOutOfBufferCompensatedMs,
      totalDroppedMs,
      reloadCount,
    } = this.state.stats;
    const {playbackRate} = this.refs.msePlayer.videoElement;

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
            {formatMs(totalOutOfBufferCompensatedMs)} out of buffer (compensated)<br/>
            {formatMs(totalDroppedMs)} in segments dropped
          </li>
          <li style={styles.videoStatsItem}>
            Reload Count: {reloadCount}<br/>
            Playback Rate: {playbackRate}x
          </li>
        </ul>
      </div>
    );
  }

  _renderDebugMenu() {
    return (
      <div style={styles.debugMenu}>
        <h4>Debug Options</h4>
        <form className="form-inline" style={styles.debugMenuForm}>
          <div className="form-group" style={styles.debugMenuFormGroup}>
            <Input
              type="checkbox"
              label=" Show Motion Events"
              ref="checkMotion"
              checked={this.state.showMotionEvents}
              onChange={this._onMotionEventsCheck}
              standalone
            />
          </div>
          <div className="form-group" style={styles.debugMenuFormGroup}>
            <Input
              type="checkbox"
              label=" Show Tracked Faces"
              ref="checkFaces"
              checked={this.state.showFaces}
              onChange={this._onFacesCheck}
              standalone
            />
          </div>
          <div className="form-group" style={styles.debugMenuFormGroup}>
            <Input
              type="checkbox"
              label=" Show Video Stats"
              ref="checkVideoStats"
              checked={this.state.showVideoStats}
              onChange={this._onVideoStatsCheck}
              standalone
            />
          </div>
          <div className="form-group" style={styles.debugMenuFormGroup}>
            <Input
              type="checkbox"
              label=" Mute Video"
              ref="checkMuted"
              checked={this.state.muted}
              onChange={this._onVideoMutedCheck}
              standalone
            />
          </div>
        </form>
        <form className="form-inline" style={styles.debugMenuForm}>
          <div className="form-group" style={styles.debugMenuFormGroup}>
            <ButtonInput
              onClick={() => this.refs.msePlayer.forceReload()}
              bsSize="small"
              standalone>
              Reload &lt;video&gt; element
            </ButtonInput>
          </div>
          <div className="form-group" style={styles.debugMenuFormGroup}>
            <ButtonInput
              onClick={() => {
                this.dropNextSegment = true;
              }}
              bsSize="small"
              standalone>
              Drop next segment
            </ButtonInput>
          </div>
          <div className="form-group" style={styles.debugMenuFormGroup}>
            <ButtonInput
              onClick={this._clogNetwork}
              bsSize="small"
              standalone>
              Clog network for {formatMs(clogDurationMs)}
            </ButtonInput>
          </div>
        </form>
      </div>
    );
  }

  render() {
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
          muted={(this.state.muted ? 'true' : null)}
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
          {this._renderConsole()}
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
