/* @flow */
/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

import createLog from './log';
const log = createLog('videoupload');

import { EventEmitter } from 'events';
import api from './api';
import * as util from './sysutils';

// Content type must be set to make clients happy later on
const VIDEO_CONTENT_TYPE = 'video/mp4';

const VIDEO_BLOB_TYPE = 'video';

const UPLOAD_PROP = 'persist.silk.vidupload.enabled';
const UPLOAD_ENABLED = util.getboolprop(UPLOAD_PROP);

const DURATION_PROP = 'persist.silk.vidduration';
const DURATION_SECONDS = util.getintprop(DURATION_PROP, 1);

import type { Socket } from 'socket.io-client';

// This should be moved to timeline.js once that gets flowified.
export type TimelineEventObject = {
  tag: string;
  when: number;
  [arbitraryKeys: string]: any;
};

type QueueItem = {
  when: number;
  frame: Buffer;
  objects: Array<TimelineEventObject>;
};

type Size = {
  width: number;
  height: number;
};

class VideoUploadQueue extends EventEmitter {
  id: string;
  serverSocket: Socket;
  _previewSize: Size;
  type: string;
  duration: number;
  previousId: ?string;
  running: boolean;
  queue: Array<QueueItem>;

  constructor(deviceId: string, duration: number) {
    super();
    this.id = deviceId;
    this.serverSocket = { connected: false };
    this._previewSize = { width: 0, height: 0 };

    // We could later make this more generic and do logging.
    this.type = 'video';

    // XXX: This is a hack until we have precise timing info on when the
    // segment has ended (in utc).
    this.duration = duration;

    this.previousId = undefined;
    this.running = false;
    this.queue = [];
  }

  /**
   *
   */
  set previewSize(size: Size) {
    this._previewSize = size;
  }

  /**
   * Add a new item to the queue to be uploaded.
   */
  add(when: number, frame: Buffer, objects: Array<TimelineEventObject>) {
    if (!UPLOAD_ENABLED) {
      return;
    }
    this.queue.push({
      when,
      frame,
      objects,
    });
    this.start();
  }

  /**
   * To make it easy on the consumer we define metadata as an ordered list... To
   * do this we need to know the previous id we uploaded.
   */
  _resolveLastId(): Promise<?string> {
    if (this.previousId) {
      return Promise.resolve(this.previousId);
    }

    return Promise.resolve().then(() => {
      // XXX: The below does do much right now since device is is unique each
      // boot currently.
      //
      // We don't have a previous id so attempt to find the closest segment.
      return api.timeMeta.findByTime({
        metaType: this.type,
        deviceId: this.id,
        time: Date.now()
      });
    }).then((result) => {
      return result.id;
    }).catch((err) => {
      log.warn('Could not find previous metadata item', err);
      // TODO: In the future an error finding the last id should be fatal or
      // something we need to resolve when we come back online for now we just
      // assume the server messed up and we start again from no previous item.
      return null;
    });
  }

  _uploadItem(previousId: ?string, item: QueueItem): Promise<void> {
    let start = Date.now();
    let { when, frame, objects } = item;
    let metadataPayload = {
      metaType: this.type,
      deviceId: this.id,
      startUTC: when,
      endUTC: when + this.duration,
      data: {
        frameWidth: this._previewSize.width,
        frameHeight: this._previewSize.height,
        objects
      },
      url: undefined,
      previousId: previousId ? previousId : undefined,
    };

    // step 1 is to upload the data...
    return api.blob.upload(VIDEO_BLOB_TYPE, frame.length, VIDEO_CONTENT_TYPE, frame)
    .then(blobUrl => {
      // step 2. upload the metadata...
      metadataPayload.url = blobUrl;
      return api.timeMeta.create(metadataPayload);
    }).then((result) => {
      this.previousId = result.id;
      log.info(
        'uploaded item id: %s, url: %s took %d ms',
        result.id,
        metadataPayload.url,
        Date.now() - start
      );
    });
  }

  _work() {
    if (!this.serverSocket.connected) {
      log.warn(`server socket not ready, not uploading`);
      this.stop();
      return;
    }

    // Shift an  item off first thing so we don't get stuck in a loop.
    let item = this.queue.shift();
    if (!item) {
      this.stop();
      return;
    }

    log.info('uploading item size: %d, time: %d', item.frame.length, item.when);

    this._resolveLastId()
    .then(previousId => this._uploadItem(previousId, item))
    .catch(err => {
      // XXX: In some cases we may want to retry an upload not now though.
      log.error('Error working item off video upload queue', err.stack);
    }).then(() => {
      if (this.queue.length) {
        // A little trick continue to work but don't use one huge promise chain.
        process.nextTick(() => this._work());
      } else {
        // No more work signal a stop.
        this.stop();
      }
    })
    .catch(util.processthrow);
  }

  /**
   * Start working the queue (it is safe to call this multiple times)
   */
  start() {
    // Already working...
    if (this.running || !UPLOAD_ENABLED) {
      return;
    }
    this.running = true;
    this.emit('starting');
    this._work();
  }

  /**
   * Stop working the queue (will not abort any running work)
   */
  stop() {
    if (!this.running) {
      return;
    }
    this.running = false;
    this.emit('stopping');
  }

  /**
   * Update this's handle to the master server socket
   */
  set socket(socket) {
    this.serverSocket = socket;
    this.start();
  }
}

module.exports = (deviceId: string): VideoUploadQueue =>
  new VideoUploadQueue(deviceId, DURATION_SECONDS * 1000);
