/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

import React from 'react';
import ReactDOM from 'react-dom';
import { Button, ButtonGroup, Glyphicon, Label, ProgressBar } from 'react-bootstrap';
import { Link } from 'react-router';
import { EventEmitter } from 'events';
import mklog from 'log'; const log = mklog('CameraVideo');

import Cameras from '../libraries/Cameras';

class VideoTag extends EventEmitter {

  constructor(tag, name) {
    super();
    this.tag = tag;
    this.name = name;
    this.state = 'idle';

    tag.addEventListener('canplay', this._onVideoCanPlay);
    tag.addEventListener('playing', this._onVideoPlaying);
    tag.addEventListener('ended', this._onVideoEnded);
  }

  deinit() {
    this.tag.pause();
    this.tag.removeEventListener('canplay', this._onVideoCanPlay);
    this.tag.removeEventListener('playing', this._onVideoPlaying);
    this.tag.removeEventListener('ended', this._onVideoEnded);
  }

  _onVideoCanPlay = () => {
    log.verbose(`Video ${this.name} ready, duration=${this.tag.duration}s ` +
      `startTime=${this.when.toLocaleDateString()} ${this.when.toLocaleTimeString()}`);
    this.state = 'ready';
    this.emit('stateChanged');
  }

  _onVideoPlaying = () => {
    this.state = 'playing';
    this.emit('stateChanged');
  }

  _onVideoEnded = () => {
    this.state = 'idle';
    this.emit('stateChanged');
  }

  load(url, when) {
    this.state = 'loading';
    this.when = when;
    this.tag.src = url;
  }

  play() {
    this.tag.play();
  }

  dumpState() {
    log.debug(`video ${this.name}: readyState=${this.tag.readyState} ` +
      `currentTime=${this.tag.currentTime} duration=${this.tag.duration}s ` +
      `paused=${this.tag.paused} ended=${this.tag.ended}`);
  }

  get currentTime() {
    return new Date(this.when.getTime() + this.tag.currentTime * 1000);
  }
}

export default class CameraVideo extends React.Component {
  state = {
    camera: null,
    activeVideoIndex: 0,
    buffering: true,
    currentDeviceTime: '',
  };

  get deviceId() {
    return this.props.params.deviceId;
  }

  componentDidMount() {
    this.videoTags = [
      new VideoTag(ReactDOM.findDOMNode(this.refs.video0), 0),
      new VideoTag(ReactDOM.findDOMNode(this.refs.video1), 1),
    ];

    this.videoTags.forEach(tag => {
      tag.on('stateChanged', this.onVideoStateChange);
    });

    Cameras.on('stateChanged', this.onCamerasStateChanged);
    this.onCamerasStateChanged(Cameras);

    this.intervalId = setInterval(this.updatePlaybackTime, 500);
  }

  get activeVideo() {
    return this.videoTags[this.state.activeVideoIndex];
  }

  get inactiveVideo() {
    return this.videoTags[this.state.activeVideoIndex === 0 ? 1 : 0];
  }

  updatePlaybackTime = () => {
    let activeVideo = this.activeVideo;
    if (activeVideo.state === 'playing') {
      this.setState({currentDeviceTime: activeVideo.currentTime.toString()});
    }
  }

  componentWillUnmount() {
    clearInterval(this.intervalId);

    let camera = this.state.camera;
    if (camera) {
      camera.removeListener('videoClip', this.onNextVideoClip);
    }

    Cameras.removeListener('stateChanged', this.onCamerasStateChanged);
    this.videoTags.forEach(tag => {
      tag.removeListener('stateChanged', this.onVideoStateChange);
      tag.deinit();
    });
    this.videoTags = null;
  }

  onCamerasStateChanged = state => {
    let oldCamera = this.state.camera;
    let newCamera = state.cameras[this.deviceId];

    if (oldCamera === newCamera) {
      return;
    }
    if (oldCamera) {
      oldCamera.removeListener('videoClip', this.onNextVideoClip);
    }
    if (newCamera) {
      newCamera.on('videoClip', this.onNextVideoClip);
    }
    this.setState({ camera: newCamera });
  };

  onNextVideoClip = (url, when) => {
    let video = this.inactiveVideo;
    if (video.state !== 'idle') {
      // TODO: Implement a queue here?
      log.warn(`Inactive video expected to be idle: state=${video.state}`);
    }
    video.load(url, when);
  };

  onVideoStateChange = () => {
    // Dump video tag states
    log.debug(`Active video tag: ${this.state.activeVideoIndex}`);
    this.videoTags.forEach(video => video.dumpState());

    let activeVideo = this.activeVideo;
    let inactiveVideo = this.inactiveVideo;

    if (activeVideo.state === 'playing') {
      return; // Still playing the current video
    }

    if (inactiveVideo.state !== 'ready') {
      log.warn(`Next video chunk not ready. state=${inactiveVideo.state}`);
      this.setState({buffering: true});
      return;
    }

    // Switch to the next video
    inactiveVideo.play();
    this.setState({
      buffering: false,
      activeVideoIndex: this.state.activeVideoIndex === 0 ? 1 : 0,
    });
  }

  render() {
    let buffering;
    if (this.state.camera && !this.state.camera.online) {
      buffering = <ProgressBar active bsSize="large" bsStyle="danger" now={100} label="Camera offline"/>;
    } else if (this.state.buffering) {
      buffering = <ProgressBar active bsSize="large" bsStyle="warning" now={100} label="Loading..."/>;
    }

    return (
      <div>
        <ButtonGroup>
          <Button bsStyle="warning">
            <Link to="/"><Glyphicon glyph="home" /></Link>
          </Button>
        </ButtonGroup>
        &nbsp; <Label>{this.state.currentDeviceTime}</Label>
        <br/>
        <video ref="video0" style={{display: this.state.activeVideoIndex === 0 ? 'inline' : 'none'}} />
        <video ref="video1" style={{display: this.state.activeVideoIndex === 1 ? 'inline' : 'none'}} />
        {buffering}
      </div>
    );
  }
}
