/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

import api from 'silk-core/lib/api';
import server from 'silk-core/lib/server';
import * as util from './sysutils';
import https from 'https';
import URL from 'url';
import eventToPromise from 'event-to-promise';
import fs from 'fs';

const logoData = fs.readFileSync(__dirname + '/../media/logoData.png');
const previewData = fs.readFileSync(__dirname + '/../media/previewData.jpg');
const videoData = fs.readFileSync(__dirname + '/../media/videoData.mp4');

const VIDEO_WIDTH = 1280;
const VIDEO_HEIGHT = 720;
const PREVIEW_SCALE = 4;
const VIDEO_DURATION = 1000;

const DEVICE_NAME = 'test';
const VIDEO_CONTENT_TYPE = 'video/mp4';
const VIDEO_BLOB_TYPE = 'video';

export default class DeviceSimulator {
  _logo = logoData;
  _previewFrame = previewData;
  _videoFrame = videoData;
  _previewSize = {
    width: VIDEO_WIDTH / PREVIEW_SCALE,
    height: VIDEO_HEIGHT / PREVIEW_SCALE
  };

  constructor(accessToken) {
    this.accessToken = accessToken;
  }

  connect() {
    return new Promise(resolve => {
      server.once('connect', () => resolve());
      server.connect();
    });
  }

  disconnect() {
    return new Promise(resolve => {
      server.once('disconnect', () => {
        util.timeout(0) // need break, otherwise socket gets in bad state
        .then(() => resolve())
        .catch(util.processthrow);
      });
      server.disconnect();
    });
  }

  emitInfo() {
    let now = Date.now();
    let info = { id: this.accessToken.toString(), name: DEVICE_NAME, now,
        logo: this._logo, previewSize: this._previewSize };

    return new Promise(resolve => {
      server.socket.emit('info', info, () => resolve());
    });
  }

  _emitVideo(frame, type, durationMs) {
    let now = Date.now();
    let data = { id: this.accessToken.toString(), objects: null,
        frame: frame, contents: type, when: now,
        durationMs: durationMs, deviceEmitMs: now };

    return new Promise(resolve => {
      server.socket.emit('video', data, () => resolve());
    });
  }

  emitJpeg(cfg) {
    let frame = ('frame' in cfg) ? cfg.frame : this._previewFrame;

    return this._emitVideo(frame, 'jpeg', 0);
  }

  emitMp4(cfg) {
    let frame = ('frame' in cfg) ? cfg.frame : this._previewFrame;
    let durationMs = ('durationMs' in cfg) ? cfg.durationMs : VIDEO_DURATION;

    return this._emitVideo(frame, 'mp4', durationMs);
  }

  async uploadBlob(cfg) {
    let frame = ('frame' in cfg) ? cfg.frame : this._videoFrame;
    let {putUrl, putHeaders} = await api.blobPublisher.putUrl(
      VIDEO_BLOB_TYPE,
      {
        contentLength: frame.length,
        contentType: VIDEO_CONTENT_TYPE,
      }
    );

    let params = Object.assign(URL.parse(putUrl), {
      method: 'PUT',
      headers: putHeaders,
    });

    let writer = https.request(params);
    writer.write(frame);
    writer.end();
    await eventToPromise(writer, 'close');

    let { url } = await api.blobPublisher.ack({ url: putUrl });
    this._blobUrl = url;
  }

  uploadMetadata(cfg) {
    let startMs = ('startMs' in cfg) ? cfg.startMs : Date.now();
    let durationMs = ('durationMs' in cfg) ? cfg.durationMs : VIDEO_DURATION;

    let metadata = {
      metaType: 'video',
      startUTC: startMs,
      endUTC: startMs + durationMs,
      data: {
        frameWidth: this._previewSize.width,
        frameHeight: this._previewSize.height,
        objects: [],
      },
      url: this._blobUrl ? this._blobUrl : undefined,
    };

    return api.metadataPublisher.create(metadata)
    .then(result => this._previousId = result.id)
    .catch(util.processthrow);
  }

  uploadVideo(cfg) {
    return this.uploadBlob(cfg)
    .then(() => this.uploadMetadata(cfg))
    .catch(util.processthrow);
  }
}
