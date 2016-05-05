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
  }

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

  get log() {
    if (!this._log) {
      this._log = createLog(this._name);
    }
    return this._log;
  }
}
