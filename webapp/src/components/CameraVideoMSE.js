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
const clogDurationMs = 2000;

const consoleMessageEntryCount = 4;

const characters = [
  'wizard',
  'ninja',
  'superhero',
  'moonwalker',
  'daredevil',
  'magician',
  'sorcerer',
  'rocket scientist',
  'gladiator',
  'doctor',
  'secret agent',
  'genius',
  'lifesaver',
  'rockstar',
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
    if (this.clogQueue) {
      log.debug(`Network is "clogged".`);
      this.clogQueue.push({segmentData, when});
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
    const objectMap = this.state.camera.objects.collect(timeStart, timeEnd);
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
      }

      if (rectCount) {
        objects.push(lastObject);
      }
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

    if (!newMessages) {
      return;
    }

    newMessages.sort((a, b) => {
      return (a.when < b.when) ? -1 : ((a.when === b.when) ? 0 : 1);
    });

    if (newMessages.length > consoleMessageEntryCount) {
      newMessages.splice(0, newMessages.length - consoleMessageEntryCount);
    }

    log.debug(`New console messages`, newMessages);
    this._setStateAsync({consoleMessages: newMessages});
  }

  _formatConsoleMessage(object, visible) {
    switch (object.tag) {
    case `face`:
      return this._formatConsoleMessageFace(object, visible);
    case `sound`:
      return this._formatConsoleMessageSound(object, visible);
    case `dnn`:
      return this._formatConsoleMessageDNN(object, visible);
    case `devicemotion`:
      return `Device moved.`;
    default:
      log.warn(`Unsupported object from '${object.tag}'`, object);
    }
    return object.name || object.tag;
  }

  _getFaceName(object) {
    if (object.faceId === null) {
      object.name = 'Unknown';
      return object.name;
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
    if (name === object.name) {
      // Probably "Wayne" ;)
      name = capitalize(name);
    } else {
      // Probably a character from our list.
      name = `The ${name}`;
    }
    if (!visible) {
      return `${name} exited the room.`;
    } else if (object.movement !== 'notchanged') {
      return `${name} is ${(object.movement === 'closer') ? 'coming closer' : 'going away' }.`;
    } else {
      return `${name} entered the room.`;
    }
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

  _formatConsoleMessageDNN(object, visible) {
    const name = object.tag.toLowerCase();
    return visible ? `A ${name} was seen.` : `The ${name} left.`;
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
        <Button
          style={styles.debugButton}
          onClick={this._clogNetwork}>
            Clog network for {formatMs(clogDurationMs)}
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
            <li>{formatConsoleTimestamp(message.when)} - {message.text}</li>);
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
