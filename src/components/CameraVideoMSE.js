/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

import assert from 'assert';
import React from 'react';
import { Button, ButtonGroup, Glyphicon, Label } from 'react-bootstrap';
import { Link } from 'react-router';

import Cameras from '../libraries/Cameras';

const CODEC_DESCRIPTOR = 'video/mp4;codecs=avc1.42c01f,mp4a.40.2';
// NB: these values are defined in the init header.  While the init
// header is hard coded, so are these constants for convenience.  If
// we ever support multiple init header types with different sample
// rates, then we'll want to read these constants from the header.
const AUDIO_TICKS_PER_SEC = 8000;  // 8KHz = audio sampling rate
const VIDEO_TICKS_PER_SEC = 90000; // libstagefright default

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

function findStashedOffsetsBox(m4s) {
  let offsets = { };
  // Find the "free" box our offsets are stashed in.
  let box = findNextBox(m4s);
  while (box.fourcc !== 'free') {
    box = findNextBox(m4s, box);
  }

  // Check that we found the right box.
  box.offset += 4/*size*/ + 4/*fourcc*/;  //eslint-disable-line semi-spacing
  box.size = 0;
  box = findNextBox(m4s, box);
  assert.equal(box.fourcc, 'xoff');

  let pos = box.offset + 4/*size*/ + 4/*fourcc*/;  //eslint-disable-line semi-spacing
  pos += 4;               // version and flags (we don't care yet)
  offsets.seqno = m4s.readInt32BE(pos);
  pos += 4;
  offsets.presentationTime = m4s.readInt32BE(pos);
  pos += 4;
  offsets.videoDecodeTime = m4s.readInt32BE(pos);
  pos += 4;
  offsets.audioDecodeTime = m4s.readInt32BE(pos);
  pos += 4;
  return offsets;
}

function prepareSegment(segment, state) {
  let m4s = new Buffer(segment);
  let seqno = state.seqno;
  let startTime = state.startTime;

  let offsets = findStashedOffsetsBox(m4s);
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

  return m4s.toArrayBuffer();
}

export default class CameraVideo extends React.Component {
  initHeader = null;
  wroteInitHeader = false;
  segmentQ = [];
  segmentState = {
    seqno: 0,
    startTime: 0,
  };
  timeUpdateInterval = null;

  state = {
    camera: null,
    currentDeviceTime: '',
  };

  get deviceId() {
    return this.props.params.deviceId;
  }

  componentDidMount() {
    console.log('Fetching init header ...');
    fetch('media/default-segment-init.mp4')
      .then(response => response.arrayBuffer())
      .then(arrayBuffer => {
        console.log('  appending init header');
        this.initHeader = new Uint8Array(arrayBuffer);
        this._feedPlayer();
      });

    this.video = React.findDOMNode(this.refs.video);
    this.mediaSource = new MediaSource();
    this.video.src = URL.createObjectURL(this.mediaSource);
    this.mediaSource.addEventListener('sourceopen', this._onSourceOpen);

    Cameras.on('stateChanged', this._onCamerasStateChanged);
    this._onCamerasStateChanged(Cameras);

    this.timeUpdateInterval = setInterval(this._updatePlaybackTime, 500);
  }

  componentWillUnmount() {
    clearInterval(this.timeUpdateInterval);

    let camera = this.state.camera;
    if (camera) {
      camera.removeListener('videoClip', this._onNextVideoClip);
    }
    Cameras.removeListener('stateChanged', this._onCamerasStateChanged);
    if (this.mediaSource) {
      this.mediaSource.addEventListener('sourceopen', this._onSourceOpen);
    }
    if (this.sourceBuffer) {
      this.sourceBuffer.removeEventListener('updateend', this._feedPlayer);
    }
  }

  _onCamerasStateChanged = state => {
    let oldCamera = this.state.camera;
    let newCamera = state.cameras[this.deviceId];

    if (oldCamera === newCamera) {
      return;
    }
    if (oldCamera) {
      oldCamera.removeListener('videoClip', this._onNextVideoClip);
    }
    if (newCamera) {
      newCamera.on('videoClip', this._onNextVideoClip);
    }
    this.setState({ camera: newCamera });
  };

  _onNextVideoClip = (url, when, segment) => {
    this._feedPlayer(null, prepareSegment(segment, this.segmentState));
  };

  _onSourceOpen = () => {
    this.sourceBuffer = this.mediaSource.addSourceBuffer(CODEC_DESCRIPTOR);
    this.sourceBuffer.addEventListener('updateend', this._feedPlayer);
    this.mediaSource.removeEventListener(this._onSourceOpen);
    this._feedPlayer();
  };

  _feedPlayer = (_, segment = null) => {
    if (!this.sourceBuffer || this.sourceBuffer.updating) {
      console.log('Source buffer not ready');
      if (segment) {
        console.log('  queuing segment for later append');
        this.segmentQ.unshift(segment);
      }
      return;
    }
    if (this.initHeader) {
      console.log('Appending initialization header');
      assert(!this.wroteInitHeader);
      this._appendSegment(this.initHeader);
      this.initHeader = null;
      this.wroteInitHeader = true;
      if (segment) {
        this.segmentQ.unshift(segment);
      }
      return;
    }
    if (!this.wroteInitHeader) {
      console.log('Waiting for init header to be written');
      if (segment) {
        this.segmentQ.unshift(segment);
      }
      return;
    }
    if (this.segmentQ.length) {
      console.log('Appending queued segment');
      this._appendSegment(this.segmentQ.pop());
      if (segment) {
        this.segmentQ.unshift(segment);
      }
      return;
    }
    if (segment) {
      console.log('Appending new segment directly', segment);
      this._appendSegment(segment);
    }
  };

  _appendSegment(segment) {
    this.sourceBuffer.appendBuffer(segment);
    if (this.video.readyState >= 2) {
      console.log('  video ready, ensuring playback');
      this.video.play();
    }
  }

  _updatePlaybackTime = () => {
    if (this.video.readyState >= 2) {
      // TODO: why is this timestamp wrong ...
      this.setState({ currentDeviceTime: this.video.currentTime.toString() });
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
        &nbsp; <Label>{this.state.currentDeviceTime}</Label>
        <br/>
        <video ref="video" />
      </div>
    );
  }
}
