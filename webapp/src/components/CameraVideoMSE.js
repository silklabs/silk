
import assert from 'assert';
import config from 'silk-config';
import React from 'react';
import { Button, ButtonGroup, Glyphicon, Label } from 'react-bootstrap';
import ReactDOM from 'react-dom';
import { Link } from 'react-router';
import createLog from 'silk-log';

import Cameras from '../libraries/Cameras';

const log = createLog('CameraVideoMSE');

const CODEC_DESCRIPTOR = 'video/mp4;codecs=avc1.42c01f,mp4a.40.2';
// NB: these values are defined in the init header.  While the init
// header is hard coded, so are these constants for convenience.  If
// we ever support multiple init header types with different sample
// rates, then we'll want to read these constants from the header.
const AUDIO_TICKS_PER_SEC = config.deviceMic.sampleRate;
const VIDEO_TICKS_PER_SEC = 90000; // libstagefright default

// Each MP4 box contains:
//   - boxSize   (4 bytes)
//   - fourcc    (4 bytes)
//   - box specific data (boxSize - 8 bytes)
//
// A box can contain box specific data or more boxes
//
const BOX_HDR_SIZE = 8;

const styles = {
  container: {
    position: 'relative',
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
};

function readFourcc(buf, offset) {
  let fourcc = '';
  for (let i = 0; i < 4; ++i) {
    fourcc += String.fromCharCode(buf[offset + i]);
  }
  return fourcc;
}

function findNextBox(mp4, box = { fourcc: '', size: 0, offset: 0 }) {
  let pos = box.offset = box.offset + box.size;
  box.size = mp4.readInt32BE(pos);
  pos += 4;
  box.fourcc = readFourcc(mp4, pos);
  return box;
}

function findMetadataBox(m4s) {
  let offsets = { };
  // Find the "free" box where our metadata is stashed in.
  let box = findNextBox(m4s);
  while (box.fourcc !== 'free') {
    box = findNextBox(m4s, box);
  }

  // Check that we found the right box.
  box.offset += BOX_HDR_SIZE;
  box.size = 0;
  box = findNextBox(m4s, box);
  assert.equal(box.fourcc, 'Xmta');

  let pos = box.offset + BOX_HDR_SIZE;
  pos += 4;               // version and flags (we don't care yet)
  offsets.seqno = m4s.readInt32BE(pos);
  pos += 4;
  offsets.presentationTime = m4s.readInt32BE(pos);
  pos += 4;
  offsets.videoDecodeTime = m4s.readInt32BE(pos);
  pos += 4;
  offsets.audioDecodeTime = m4s.readInt32BE(pos);
  pos += 4;
  let mute = m4s.readInt32BE(pos);
  pos += 4;
  return {offsets, mute};
}

function prepareSegment(segment, state) {
  let m4s = new Buffer(segment);
  let seqno = state.seqno;
  let startTime = state.startTime;

  let {offsets, mute} = findMetadataBox(m4s);
  // Duration is 16 bytes after earliest_presentation_time in "sidx".
  let durationTicks = m4s.readInt32BE(offsets.presentationTime + 16);

  assert.equal('?seq', readFourcc(m4s, offsets.seqno));
  // XXX doesn't matter in chrome
  m4s.writeInt32BE(seqno, offsets.seqno);

  let videoDecodeTime = startTime + m4s.readInt32BE(offsets.videoDecodeTime);
  assert.equal('?prs', readFourcc(m4s, offsets.presentationTime));
  // XXX maybe doesn't matter in chrome
  m4s.writeInt32BE(videoDecodeTime, offsets.presentationTime);
  m4s.writeInt32BE(videoDecodeTime, offsets.videoDecodeTime);

  // TODO: get timeScales from init header
  let startTimeDelta =
        (startTime * AUDIO_TICKS_PER_SEC / VIDEO_TICKS_PER_SEC) | 0;
  let audioDecodeTime =
        startTimeDelta + m4s.readInt32BE(offsets.audioDecodeTime);
  m4s.writeInt32BE(audioDecodeTime, offsets.audioDecodeTime);

  ++state.seqno;
  state.startTime += durationTicks;

  return { data: m4s.toArrayBuffer(), mute: mute };
}

export default class CameraVideo extends React.Component {
  video = null;
  canvas = null;
  context = null;
  mediaSource = null;
  sourceBuffer = null;

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
    videoTime: '',
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
    }

    if (this.sourceBuffer) {
      this.sourceBuffer.removeEventListener('updateend', this._feedPlayer);
    }

    URL.revokeObjectURL(this.video.src);
  }

  _updateCanvasSize = () => {
    const rect = this.video.getBoundingClientRect();
    this.canvas.width = Math.floor(rect.width);
    this.canvas.height = Math.floor(rect.height);
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
    }

    this.setState({
      camera: newCamera,
      videoTime: '',
    });

    this._renderCanvas();
  };

  _onNextVideoClip = (url, when, segment) => {
    if (!this.videoStartTime) {
      this.videoStartTime = when.getTime();
    }
    this._feedPlayer(null, prepareSegment(segment, this.segmentState));
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
      this._appendSegment({data: this.initHeader, mute: true});
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
        this.sourceBuffer.appendBuffer(seg.data);
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
  }

  _onTimeUpdate = () => {
    if (this.loadedData) {
      const durationMs = Math.floor(this.video.currentTime * 1000);
      const time = new Date(this.videoStartTime + durationMs);
      if (!this.state.videoTime || time.toString() !== this.state.videoTime) {
        this.setState({videoTime: time.toString()});
      }
    }

    this._renderCanvas();
  };

  _renderCanvas() {
    requestAnimationFrame(() => {
      const canvas = this.canvas;
      const context = this.context;

      context.save();

      try {
        this._renderCanvasInternal(context, canvas.width, canvas.height);
      } catch(err) {
        log.warn(err);
      }

      context.restore();
    });
  }

  _renderCanvasInternal(context, width, height) {
    context.clearRect(0, 0, width, height);

    const camera = this.state.camera;
    const online = this.renderedOnline = camera ? camera.online : false;
    const defaultFont = '12px sans-serif';

    if (!camera || !online) {
      context.fillStyle = 'grey';
      context.fillRect(0, 0, width, height);

      if (!online) {
        context.font = defaultFont;
        context.fillStyle = 'white';
        context.textAlign = 'end';
        context.textBaseline = 'top';
        context.fillText('Offline', width - 5, 5);
      }

      return;
    }

    if (!this.loadedData) {
      context.fillStyle = 'lightgrey';
      context.fillRect(0, 0, width, height);

      // TODO: Add a spinner? Some kind of 'loading' text?
      return;
    }

    const time =
      this.videoStartTime + Math.floor(this.video.currentTime * 1000);
    const objects = camera.objects.collect(time, time + 50);
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

      // All objects are scaled to the previewSize so we have to expand to fill
      // the window.
      const xScale = width / camera.previewSize.width;
      const yScale = height / camera.previewSize.height;

      objects.forEach((object, index) => {
        const tag = object.tag;
        context.strokeStyle = objectColors[index % objectColors.length];

        object.rects.forEach((rect) => {
          const x = Math.round(rect.x * xScale);
          const y = Math.round(rect.y * yScale);
          const w = Math.round(rect.width * xScale);
          const h = Math.round(rect.height * yScale);

          context.strokeRect(x, y, w, h);
          context.fillText(tag, x, y + h + 10);
        });
      });
    }
  }

  render() {
    return (
      <div>
        <ButtonGroup>
          <Button bsStyle="warning">
            <Link to="/"><Glyphicon glyph="home" /></Link>
          </Button>
        </ButtonGroup>
        <Label>{this.state.videoTime}</Label>
        <div style={styles.container}>
          <video
            autoPlay="true"
            style={styles.video}
            ref="video"
            onLoadedData={this._onLoadedData}
            onResize={this._updateCanvasSize}
            onTimeUpdate={this._onTimeUpdate}
          />
          <canvas style={styles.canvas} ref="canvas"></canvas>
        </div>
      </div>
    );
  }
}
