/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

import createLog from 'silk-log/device';
import createOutbox from 'silk-core/lib/outbox';
import NetworkStatus from 'silk-core/lib/network_status';
import Timeline from 'silk-core/lib/timeline';
import Server from 'silk-core/lib/server';
import * as util from 'silk-core/lib/sysutils';
import wifi from 'silk-core/lib/wifi';
import Camera from 'silk-core/lib/camera';
import invariant from 'assert';
import opencv from 'opencv';
import fs from 'fs';
import path from 'path';

const log = createLog('TestFramework');

/**
 * Dummy environment class
 */
export default class Framework {
  constructor(name) {
    this._name = name;
    this.networkStatus = new NetworkStatus(wifi);
    this.server = new Server(wifi);
    this.outbox = createOutbox(this.networkStatus);
    this.timeline = new Timeline(this.server, this.outbox);
    this.util = util;

    this.camera = new Camera(this.server, this.timeline);
    this.camera.setPreviewFrame = (when, file) => this._loadPreviewFrame(when, file);
    this.camera.startPlayback = clipDirectory => this._startPlayback(clipDirectory);
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
  _loadPreviewFrame(when, file) {
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

        resolve();
      });
    });
  }

  /**
   * Emit images as previews from the specified directory at the
   * interval specified by camera preview.
   *
   * @param clipDirectory: Directory containing list of preview images to emit
   */
  _startPlayback(clipDirectory) {
    if (!fs.existsSync(clipDirectory)) {
      log.error(`${clipDirectory} does not exist`);
      return;
    }
    let previews = fs.readdirSync(clipDirectory);
    this._previewCount = 0;

    let delayMs = this.camera.FRAME_DELAY_MS;
    this._playback(clipDirectory, delayMs, previews);
  }

  /**
   *
   */
  _playback(clipDirectory, delayMs, previews) {
    const spilloverMs = Date.now() % delayMs;
    const requestedDelayMs = delayMs - spilloverMs + 5;

    this._previewTimeout = setTimeout(async () => {
      try {
        let when = Date.now();
        await this._loadPreviewFrame(when,
            path.join(clipDirectory, previews[this._previewCount++]));
        this.timeline.emit('preview', when);
      } catch (err) {
        log.error(`Failed to emit preview ${err}`);
      }

      if (this._previewCount < previews.length) {
        process.nextTick(() => this._playback(clipDirectory, delayMs,
            previews));
      }
    }, requestedDelayMs);
  }

  get log() {
    if (!this._log) {
      this._log = createLog(this._name);
    }
    return this._log;
  }
}
