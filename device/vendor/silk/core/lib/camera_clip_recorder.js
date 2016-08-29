/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @flow
 */

import * as util from 'silk-sysutils';
import CBuffer from 'CBuffer';
import createLog from 'silk-log/device';
import cv from 'opencv';
import fs from 'mz/fs';
import invariant from 'assert';
import mkdirp from 'mkdirp-promise';
import path from 'path';
import wrapNoEntity from './fs/wrap_no_entity';
import type {Camera} from 'silk-camera';
import type {ChannelEventEmitter} from './connections';

const log = createLog('camera_cr');

const MAX_CLIP_DURATION = Math.max(1, util.getintprop('ro.silk.camera.max_clip_dur', 15 /*seconds*/));
const CAMERA_CLIP_DIRECTORY = 'data/clips';

/**
 * Current state of the CameraClipRecorder.
 * live - normal camera mode
 * record - actively recording frames into the circular buffer
 * pause - paused in playback mode
 * play - playback mode active
 * busy - currently loading or saving a clip
 */
type CameraClipRecorderMode = 'live' | 'record' | 'pause' | 'play' | 'busy';

/**
 * CameraClipRecorder state
 *
 * This entire type is shared with the web app, so if you change it then
 * update webapp/src/components/Diag.js too
 */
type CameraClipRecorderState = {
  mode: CameraClipRecorderMode;
  availableClips: Array<string>; // List of available clips to load
  msg: string; // Something to display to the diag user (eg, result of last op)
  repeat: bool; // True if the replay should repeat once at the end
};

type CameraClipFrameImages = [
  number, // when
  any,   // Full rgb matrix for this camera frame
  any,   // Full grayscale matrix for this camera frame
  any,   // Scaled grayscale matrix for this camera frame
];
function CameraClipFrameImagesRelease(item: CameraClipFrameImages): void {
  item[1].release();
  item[2].release();
  item[3].release();
}

/**
 * Represents the "clip recorder", which enables the recording and replay of
 * camera video streams
 */
export default class CameraClipRecorder {
  state: CameraClipRecorderState;
  _diag: ChannelEventEmitter;
  _camera: Camera;
  _liveDiag: bool;

  _frames: CBuffer<CameraClipFrameImages>;
  _framePosition: number;

  constructor(camera: any /*Camera*/, diag: ChannelEventEmitter) {
    this._camera = camera;
    this._diag = diag;

    this._framePosition = 0;
    this._frames = new CBuffer(MAX_CLIP_DURATION * 1000 / this._camera.FRAME_DELAY_MS);
    this._frames.overflow = CameraClipFrameImagesRelease;

    this.state = {
      mode: 'live',
      availableClips: [],
      msg: '',
      repeat: false,
    };
    this.reset();
    this._loadAvailableClips();
    this._diag.on('cameraClipRecorder:cmd', cmd => {
      this.diagCommand(cmd.name, cmd.arg);
    });
  }

  _onStateChange: (() => void) = () => {
    log.verbose(`Emitting diag state:`, this.state);
    this._diag.emit('cameraClipRecorder:state', this.state);
  };

  diagCommand(name: string, arg: string): void {
    log.verbose(`diag command: ${name} ${arg}`);
    switch (name) {
    case 'hi':
      this._onStateChange();
      break;
    case 'record':
      switch (arg) {
      case 'start':
        this.startRecording();
        break;
      case 'stop':
        this.stopRecording();
        break;
      default:
        log.error('Unknown record arg:', arg);
        break;
      }
      break;
    case 'live':
      this.resumeLive();
      break;
    case 'playback':
      switch (arg) {
      case 'start':
        this.startPlayback();
        break;
      case 'stop':
        this.stopPlayback();
        break;
      default:
        log.error('Unknown playback arg:', arg);
        break;
      }
      break;
    case 'goto start':
      this.seek(-Infinity);
      break;
    case 'rewind':
      this.seek(-1000 / this._camera.FRAME_DELAY_MS);
      break;
    case 'fastforward':
      this.seek(1000 / this._camera.FRAME_DELAY_MS);
      break;
    case 'goto end':
      this.seek(Infinity);
      break;
    case 'repeat':
      this.setRepeat(!!arg);
      break;
    case 'trim':
      switch (arg) {
      case 'before':
        this.trimBefore();
        break;
      case 'after':
        this.trimAfter();
        break;
      default:
        log.error('Unknown trim arg:', arg);
        break;
      }
      break;
    case 'load':
      this.load(arg);
      break;
    case 'save':
      this.save(arg);
      break;
    default:
      log.error('Unknown command name:', name);
      break;
    }
  }

  async _loadAvailableClips() {
    this.state.availableClips = [];
    const files = await wrapNoEntity(fs.readdir(CAMERA_CLIP_DIRECTORY), []);
    invariant(files);
    for (const file of files) {
      const ext = path.extname(file);
      if (ext === '.json') {
        this.state.availableClips.push(path.basename(file, ext));
      }
    }
    if (this.state.availableClips.length > 0) {
      log.info('Loaded clips:', this.state.availableClips);
      this._onStateChange();
    }
  }

  _loadImage(file: string): Promise<any> {
    return new Promise((resolve, reject) => {
      cv.readImage(file, (err, im) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(im);
      });
    });
  }

  /*
   * Loads a clip
   */
  async load(name: string): Promise<void> {
    const clipMetadataFile = path.join(CAMERA_CLIP_DIRECTORY, name + '.json');
    if (!await fs.exists(clipMetadataFile)) {
      log.warn('Clip metadata does not exist:', clipMetadataFile);
      return;
    }

    this.state.msg = `Loading ${name}...`;
    this.state.mode = 'busy';
    this._onStateChange();

    const metadata = JSON.parse(await fs.readFile(clipMetadataFile, 'utf8'));
    const frames = metadata.frames;
    this._frames.empty();
    this._framePosition = 0;

    await frames.forEach(async (when) => {
      let imageFile = path.join(CAMERA_CLIP_DIRECTORY, 'img', `${when}.png`);
      if (!await fs.exists(imageFile)) {
        log.warn('Clip image does not exist:', imageFile);
        return;
      }
      log.verbose('Loading', imageFile);
      const imRGB = await this._loadImage(imageFile);

      let imGray = imRGB.copy();
      imGray.cvtColor('CV_BGR2GRAY');

      let imScaledGray = imGray.copy();
      imScaledGray.resize(this._camera.FRAME_SIZE.normal.width, this._camera.FRAME_SIZE.normal.height);

      this._frames.push([when, imRGB, imGray, imScaledGray]);
    });
    this.state.msg = `Loaded ${CAMERA_CLIP_DIRECTORY}/${name}`;
    this.state.mode = 'pause';
    this._onStateChange();
  }

  /*
   * Saves the current clip
   */
  async save(name: string): Promise<void> {
    if (this.state.mode !== 'pause' && this.state.mode !== 'play') {
      this._onStateChange();
      return;
    }

    this.state.msg = `Saving ${name}...`;
    this.state.mode = 'busy';
    this._onStateChange();
    const frames = this._frames.toArray();
    let metadata = {
      frames: frames.map(item => item[0]),
    };

    await mkdirp(path.join(CAMERA_CLIP_DIRECTORY, 'img'));
    const clipMetadataFile = path.join(CAMERA_CLIP_DIRECTORY, name + '.json');
    await fs.writeFile(clipMetadataFile, JSON.stringify(metadata, null, '  '));

    await frames.forEach(async (item) => {
      let [when, imRGB] = item;

      let imageFile = path.join(CAMERA_CLIP_DIRECTORY, 'img', `${when}.png`);
      if (!await fs.exists(imageFile)) {
        log.verbose('Saving', imageFile);
        imRGB.save(imageFile);
      }
    });
    this.state.msg = `Saved ${CAMERA_CLIP_DIRECTORY}/${name}`;
    this.state.mode = 'pause';
    this.state.availableClips.push(name);
    this._onStateChange();
  }

  /*
   * Reset to the default/live state
   */
  reset(): void {
    this.resumeLive();
  }

  maybeReplace(when: number, imRGB: any, imGray: any, imScaledGray: any): CameraClipFrameImages {
    switch (this.state.mode) {
    case 'record':
      this._frames.push([
        when,
        imRGB.copy(),
        imGray.copy(),
        imScaledGray.copy(),
      ]);
      // fall through
    case 'live':
      return [when, imRGB, imGray, imScaledGray];
    default:
      {
        if (this._framePosition >= this._frames.size) {
          log.error('Invalid _framePosition.',
            `${this._framePosition} >= ${this._frames.size}`);
          this.stopPlayback();
          return [when, imRGB, imGray, imScaledGray];
        }

        const frame = this._frames.get(this._framePosition);

        let nextFramePosition = this._framePosition;
        if (this.state.mode === 'play') {
          nextFramePosition++;
          if (nextFramePosition >= this._frames.size) {
            if (this.state.repeat) {
              nextFramePosition = 0;
            } else {
              nextFramePosition = this._frames.size - 1;
              this.stopPlayback();
            }
          }
        }
        this._framePosition = nextFramePosition;

        imRGB.release();
        imGray.release();
        imScaledGray.release();

        [when, imRGB, imGray, imScaledGray] = frame;
        return [when, imRGB.copy(), imGray.copy(), imScaledGray.copy()];
      }
    }
  }

  resumeLive(): void {
    if (this.state.mode !== 'busy') {
      this.state.mode = 'live';
      this.state.msg = '';
      this._frames.empty();
    }
    this._onStateChange();
  }

  startRecording(): void {
    if (this.state.mode === 'live') {
      this.state.mode = 'record';
      this.state.msg = 'Recording';
    }
    this._onStateChange();
  }

  stopRecording(): void {
    if (this.state.mode === 'record') {
      this.state.mode = 'pause';
      this.seek(-Infinity);
    } else {
      this._onStateChange();
    }
  }


  startPlayback(): void {
    if (this.state.mode === 'pause') {
      this.state.mode = 'play';
      this.state.msg = 'Playing';
    }
    this._onStateChange();
  }

  stopPlayback(): void {
    if (this.state.mode === 'play') {
      this.state.mode = 'pause';
      this.seek(0);
    } else {
      this._onStateChange();
    }
  }

  setRepeat(enabled: bool): void {
    this.state.repeat = enabled;
    this._onStateChange();
  }

  _clamp(v: number, min: number, max: number): number {
    return Math.min(max, Math.max(v, min));
  }

  seek(distance: number): void {
    if (this.state.mode === 'pause' || this.state.mode === 'play') {
      this._framePosition = this._clamp(this._framePosition + distance,
        0, Math.max(0, this._frames.size - 1));
      this.state.msg = `Seek to ${this._framePosition}`;
    }
    this._onStateChange();
  }

  trimBefore(): void {
    if (this.state.mode === 'pause') {
      for (let i = 0; i < this._framePosition; i++) {
        this._frames.shift();
      }
      this.state.msg = `Trimmed before ${this._framePosition}`;
      this._framePosition = 0;
    }
    this._onStateChange();
  }

  trimAfter(): void {
    if (this.state.mode === 'pause') {
      while (this._frames.size > this._framePosition + 1) {
        this._frames.pop();
      }
      this.state.msg = `Trimmed after ${this._framePosition}`;
      this._framePosition = this._frames.size - 1;
    }
    this._onStateChange();
  }
}
