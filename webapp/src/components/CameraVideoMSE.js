import invariant from 'assert';
import React from 'react';
import { Input } from 'react-bootstrap';
import ReactDOM from 'react-dom';
import createLog from 'silk-log';

import MSEPlayer from './MSEPlayer';
import Cameras from '../libraries/Cameras';

const log = createLog('CameraVideoMSE');

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
  transparentGray: 'rgba(160,160,160,0.75)',
  transparentDarkGray: 'rgba(66,66,66,0.75)',
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
  videoStats: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    padding: 10,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  videoStatsItem: {
    marginTop: 10,
    marginBottom: 10,
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
    pointerEvents: 'none',
    backgroundColor: colors.darkGray,
  },
  canvas: {
    position: 'absolute',
    top: 0,
    left: 0,
    pointerEvents: 'none',
  },
  form: {
    backgroundColor: colors.red,
    padding: '1px 8px 1px 8px',
    margin: 0,
    textAlign: 'right',
  },
};

function asciiSum(string) {
  let sum = 0;
  for (let index = 0; index < string.length; index++) {
    sum += string.charCodeAt(index);
  }
  return sum;
}

function capitalize(string) {
  return string.charAt(0).toUpperCase() + string.substr(1).toLowerCase();
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

  videoStartTimestampClient = null;
  videoStartTimestampDevice = null;
  loadedData = false;
  renderedOnline = false;

  expectNextSegmentTimestamp = null;
  lastStalledTimestamp = null;

  emptyBufferTimestamp = null;
  emptyBufferVideoStartTimeOffsetMs = 0;
  outOfBufferTimer = null;
  outOfBuffer = false;
  previousSegmentEndTimeMs = null;

  state = {
    camera: null,
    consoleMessages: [],
    showMotionEvents: false,
    showVideoStats: false,
    deviceToClientLagMs: null,
    totalDroppedMs: 0,
    totalStalledMs: 0,
    totalOutOfBufferMs: 0,
    totalBufferedMs: 0,
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

  componentWillUnmount() {
    Cameras.removeListener('stateChanged', this._onCamerasStateChanged);
    const camera = this.state.camera;
    if (camera) {
      camera.removeListener('videoClip', this._onNextVideoClip);
    }
    window.removeEventListener('resize', this._updateCanvasSize);
  }

  _updateCanvasSize = () => {
    if (!this.refs.msePlayer) {
      this.canvas.style.width = 0;
      this.canvas.style.height = 0;
      return;
    }
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

    this._renderCanvas();
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

    if (oldCamera) {
      oldCamera.removeListener('videoClip', this._onNextVideoClip);

      this.videoStartTimestampClient = null;
      this.videoStartTimestampDevice = null;
      this.loadedData = false;
    }

    if (newCamera) {
      newCamera.addListener('videoClip', this._onNextVideoClip);
    }

    this.setState({
      camera: newCamera,
    });

    this._renderCanvas();
  };

  _onNextVideoClip = (segmentData, when) => {
    if (this.videoStartTimestampDevice === null) {
      this.videoStartTimestampDevice = when;
    }

    // Calculate device-to-client lag. Also figure out if we dropped
    // any segments. Given the current segment's duration and device
    // timestamp, we can figure out what timestamp the next segment
    // segment should have. We record any discrepancies.
    let delta = 0;
    if (this.expectNextSegmentTimestamp !== null) {
      delta = when - this.expectNextSegmentTimestamp;
    }
    const deviceToClientLagMs = Date.now() - when;
    requestAnimationFrame(() => this.setState({
      deviceToClientLagMs,
      totalDroppedMs: this.state.totalDroppedMs + delta,
    }));

    const segment = this.refs.msePlayer.feedSegmentData(segmentData);
    this.expectNextSegmentTimestamp = when + segment.videoDurationTimeMs;
  };

  _onMotionEventsCheck = () => {
    const showMotionEvents = this.refs.checkMotion.getChecked();
    if (showMotionEvents === this.state.showMotionEvents) {
      return;
    }
    this.setState({showMotionEvents});
    this._renderCanvas();
  };

  _onVideoStatsCheck = () => {
    const showVideoStats = this.refs.checkVideoStats.getChecked();
    if (showVideoStats === this.state.showVideoStats) {
      return;
    }
    this.setState({showVideoStats});
  };

  _onLoadedData = () => {
    this.loadedData = true;
    this._renderCanvas();
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

    context.clearRect(0, 0, canvasWidth, canvasHeight);

    if (!camera || !online) {
      context.fillStyle = colors.transparentDarkGray;
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
      context.fillStyle = colors.transparentGray;
      context.fillRect(0, 0, canvasWidth, canvasHeight);

      // TODO: Add a spinner? Some kind of 'loading' text?
      return;
    }

    context.font = defaultFont;

    // Draw objects.
    const video = this.refs.msePlayer.videoElement;
    const currentVideoTimeMs = video.currentTime * 1000;
    const time = this.videoStartTimestampDevice + Math.floor(currentVideoTimeMs);
    const objects = this._collectAndProcessObjects(time);
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
        if (!object.rects.length) {
          return;
        }

        const label = object.name || object.tag;
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

  _collectAndProcessObjects(time) {
    invariant(this.state.camera);

    const objects = [];

    // Collect all objects that should be present in this time window.
    const objectMap = this.state.camera.objects.collect(time - 50, time + 50);
    if (!objectMap.size) {
      return objects;
    }

    let consoleMessageObjects;

    objectMap.forEach((objectArray, objectId) => {
      const tag = objectArray[0].tag;

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
        source: objectArray[0].source,
        tag,
        rects: [],
      });

      const rectCount = averageObject.rects.length;
      if (!rectCount || tag === 'face') {
        consoleMessageObjects = consoleMessageObjects || [];
        consoleMessageObjects.push(averageObject);
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
      });
    });

    if (!newMessages) {
      return;
    }

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

  _onVideoStalledOrResumed = (event) => {
    log.debug(`Video playback ${event.type}`);
    if (event.type === 'playing') {
      if (this.videoStartTimestampClient === null) {
        this.videoStartTimestampClient = Date.now();
      }
      if (this.lastStalledTimestamp === null) {
        log.debug(`Video resuming, but no previously recorded stall. Ignoring.`);
        return;
      }
      const delta = Date.now() - this.lastStalledTimestamp;
      log.debug(`Video resuming after ${delta} ms stall.`);

      this.lastStalledTimestamp = null;
      requestAnimationFrame(() => this.setState({
        totalStalledMs: this.state.totalStalledMs + delta,
      }));
      return;
    }

    if (this.lastStalledTimestamp !== null) {
      log.debug(`Already recorded earlier stalled timestamp. Not overwriting.`);
      return;
    }
    log.debug(`Video stalled.`);
    this.lastStalledTimestamp = Date.now();
  };

  _onSegmentEnqueued = (segment) => {
    // Are we getting a segment having been out of buffered data? If
    // so, record the time we presumably spent without having any
    // buffered data.
    const timeSinceLastOutOfBuffer = Date.now() - this.emptyBufferTimestamp;
    let timeOutOfBuffer = 0;
    if (this.outOfBuffer) {
      const timePreviouslyBuffered =
        this.previousSegmentEndTimeMs - this.emptyBufferVideoStartTimeOffsetMs;
      timeOutOfBuffer = timeSinceLastOutOfBuffer - timePreviouslyBuffered;
      log.debug(`We were apparently out of buffered data for ${timeOutOfBuffer} ms.`);
    }

    if (this.outOfBuffer || this.emptyBufferTimestamp === null) {
      this.emptyBufferTimestamp = Date.now();
      this.emptyBufferVideoStartTimeOffsetMs = segment.videoStartTimeMs;
      this.outOfBuffer = false;
    }
    this.previousSegmentEndTimeMs = segment.videoStartTimeMs + segment.videoDurationTimeMs;

    // Calculate the time when we'd expect the <video> element to be
    // out of buffered data.
    const video = this.refs.msePlayer.videoElement;
    const outOfBufferMs = this.previousSegmentEndTimeMs - video.currentTime * 1000;
    log.debug(`Expecting <video> element to run out of buffered data in ${outOfBufferMs} ms`);
    clearTimeout(this.outOfBufferTimer);
    this.outOfBufferTimer = setTimeout(this._onOutOfBuffer, outOfBufferMs);

    requestAnimationFrame(() => this.setState({
      totalBufferedMs: segment.videoStartTimeMs,
      totalOutOfBufferMs: this.state.totalOutOfBufferMs + timeOutOfBuffer,
    }));
  };

  _onOutOfBuffer = () => {
    log.debug(`Expecting <video> element to be out of buffered data at this point.`);
    this.outOfBuffer = true;
  };

  render() {
    let console = null;
    if (this.state.camera &&
        this.state.camera.online &&
        this.state.consoleMessages.length) {
      const messages = this.state.consoleMessages.map((message) => <li>{message.text}</li>);
      console = (
        <div style={styles.consoleContainer}>
          <h2 style={styles.consoleHeader}>Events</h2>
          <ul style={styles.consoleMessages}>{messages}</ul>
        </div>
      );
    }
    let videoStats = null;
    if (this.state.showVideoStats && this.state.deviceToClientLagMs) {
      const currentVideoTimeMs = this.refs.msePlayer.videoElement.currentTime * 1000;
      const elapsedMs = Date.now() - this.videoStartTimestampClient;
      const {
        deviceToClientLagMs,
        totalStalledMs,
        totalBufferedMs,
        totalOutOfBufferMs,
        totalDroppedMs,
      } = this.state;
      videoStats = (
        <div style={styles.videoStats}>
          <ul style={styles.consoleMessages}>
            <li style={styles.videoStatsItem}>
              Time:<br/>
              {formatMs(elapsedMs)} elapsed<br/>
              {formatMs(currentVideoTimeMs)} {' <video> '}
              ({formatDeltaMs(currentVideoTimeMs - elapsedMs)})
            </li>
            <li style={styles.videoStatsItem}>
              Buffer:<br/>
              {formatMs(totalBufferedMs)} buffered<br/>
              {formatMs(currentVideoTimeMs)} {' <video> '}
              ({formatDeltaMs(currentVideoTimeMs - totalBufferedMs)})
            </li>
            <li style={styles.videoStatsItem}>
              Lag/Stalls/Drops:<br/>
              {formatMs(deviceToClientLagMs)} lag device to client<br/>
              {formatMs(totalStalledMs)} {' <video> '} stalls (Firefox only)<br/>
              {formatMs(totalOutOfBufferMs)} out of buffer<br/>
              {formatMs(totalDroppedMs)} in segments dropped
            </li>
          </ul>
        </div>
      );
    }
    let msePlayer = null;
    if (this.state.camera) {
      msePlayer = (
        <MSEPlayer
          ref="msePlayer"
          key={this.state.camera.id}
          autoPlay="true"
          style={styles.video}
          onLoadedMetadata={this._updateCanvasSize}
          onLoadedData={this._onLoadedData}
          onResize={this._updateCanvasSize}
          onTimeUpdate={this._onTimeUpdate}
          onStalled={this._onVideoStalledOrResumed}
          onWaiting={this._onVideoStalledOrResumed}
          onPlaying={this._onVideoStalledOrResumed}
          onSegmentEnqueued={this._onSegmentEnqueued}
        />
      );
    }
    return (
      <div style={styles.global}>
        <h1 style={styles.header}>Silk Labs</h1>
        <div style={styles.videoContainer}>
          {msePlayer}
          {console}
          {videoStats}
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
