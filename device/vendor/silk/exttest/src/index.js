/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 * @flow
 */

import {getOutboxInstance} from 'silk-outbox';
import Timeline from 'silk-core/lib/timeline';
import {default as Connections, ChannelEventEmitter} from 'silk-core/lib/connections';
import createLog from 'silk-log/device';
import Camera from 'silk-camera';
import invariant from 'assert';
import opencv from 'opencv';
import fs from 'fs';
import path from 'path';

import type { Outbox } from 'silk-outbox';
import type Sensors from 'silk-sensors';
import type { TimelineEventCallback } from 'silk-core/lib/timeline';

const log = createLog('TestFramework');

export type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

class Say {
  speak(text: string): void {
  }
}

export type Log = typeof log;
export type { Camera };
export type { Say };
export type { Sensors };
export type { Timeline };
export type { TimelineEventCallback };

/**
 * Dummy environment class
 */
export default class Env {
  _name: string;
  camera: Camera;
  outbox: Outbox;
  timeline: Timeline;
  sensors: Sensors;
  say: Say;
  _previewCount: number;
  _previewTimeout: number | null;
  _log: Log;

  constructor(name: string) {
    this._name = name;
    this.camera = new Camera();
    this.outbox = getOutboxInstance();
    let connections = new Connections();
    this.timeline = new Timeline(
      this.outbox,
      this.camera,
      {
        diag: new ChannelEventEmitter('diag', connections),
        mic: new ChannelEventEmitter('mic', connections),
        objects: new ChannelEventEmitter('objects', connections),
        video: new ChannelEventEmitter('video', connections),
      }
    );

    this.camera.setPreviewFrame = (when, file) => this._loadPreviewFrame(when, file);
    this.camera.startPlayback = (clipDirectory, rate = 'slow', callback) =>
      this._startPlayback(clipDirectory, rate, callback);
    this.camera.stopPlayback = () => {
      if (this._previewTimeout) {
        clearInterval(this._previewTimeout);
        this._previewTimeout = null;
      }
    };
  }

  /**
   * Load a preview frame to the camera pipeline
   */
  _loadPreviewFrame(when: number, file: string) {
    return new Promise(resolve => {
      opencv.readImage(file, (err, im) => {
        invariant(err === null, err);
        invariant(im.width() > 0 && im.height() > 0);

        im.resize(this.camera.FRAME_SIZE.full.width,
            this.camera.FRAME_SIZE.full.height);
        let fullgray = im.clone();
        fullgray.convertGrayscale();

        let gray = fullgray.clone();
        gray.resize(this.camera.FRAME_SIZE.normal.width,
            this.camera.FRAME_SIZE.normal.height);

        // Cache the camera frame
        this.camera._imagecache.push({
          when,
          fullgray,
          fullrgb: im,
          gray,
        });

        resolve(im);
      });
    });
  }

  /**
   * Emit images as previews from the specified directory at the
   * interval specified by camera preview for slow or fast previews
   *
   * @param clipDirectory: Directory containing list of preview images to emit
   * @param rate: Emit previews at a regular preview rate if 'slow'
   *              or else emit previews at a fast preview rate
   * @param callback: This callback is called when done emiting all the
   *                  previews images
   */
  _startPlayback(clipDirectory: string, rate: string, callback?: any) {
    if (!fs.existsSync(clipDirectory)) {
      log.error(`${clipDirectory} does not exist`);
      return;
    }
    let previews = fs.readdirSync(clipDirectory);
    this._previewCount = 0;

    let delayMs = this.camera.FRAME_DELAY_MS;
    if (rate === 'fast') {
      delayMs = this.camera.FAST_FRAME_DELAY_MS;
    }
    this._playback(clipDirectory, rate, delayMs, previews, callback);
  }

  /**
   *
   */
  _playback(clipDirectory: string, rate: string, delayMs: number, previews: Array<string>, callback?: any) {
    const spilloverMs = Date.now() % delayMs;
    const requestedDelayMs = delayMs - spilloverMs + 5;

    this._previewTimeout = setTimeout(async () => {
      try {
        let when = Date.now();
        let im = await this._loadPreviewFrame(when,
            path.join(clipDirectory, previews[this._previewCount++]));
        if (rate === 'slow') {
          this.timeline.emit('preview', when);
        } else {
          this.timeline.emit('preview-fast', when, im);
        }
      } catch (err) {
        log.error(`Failed to emit preview ${err.stack || err}`);
      }

      if (this._previewCount < previews.length) {
        process.nextTick(() => this._playback(clipDirectory, rate, delayMs,
            previews, callback));
      } else {
        log.info('Finished feeding preview images');
        if (callback) {
          callback();
        }
      }
    }, requestedDelayMs);
  }

  get log(): Log {
    if (!this._log) {
      this._log = createLog(this._name);
    }
    return this._log;
  }
}

export type { Env };

