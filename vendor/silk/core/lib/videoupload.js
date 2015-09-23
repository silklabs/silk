/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

let log = require('./log')('videoupload');
import { EventEmitter } from 'events';
import api from './api';
let util = require('./util');

// Content type must be set to make clients happy later on
const VIDEO_CONTENT_TYPE = 'video/mp4';

const VIDEO_BLOB_TYPE = 'video';

const UPLOAD_PROP = 'persist.silk.vidupload.enabled';
const UPLOAD_ENABLED = util.getboolprop(UPLOAD_PROP);

const DURATION_PROP = 'persist.silk.vidduration';
const DURATION_SECONDS = util.getintprop(DURATION_PROP, 1);

class VideoUploadQueue extends EventEmitter {
  /**
   * @param {String} id device id.
   * @param {Number} duration in milliseconds.
   */
  constructor(id, duration) {
    super();
    this.id = id;
    this.serverSocket = { connected: false };
    this._previewSize = {width: 0, height: 0};

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
  set previewSize(size) {
    this._previewSize = size;
  }

  /**
   * Add a new item to the queue to be uploaded.
   *
   * @param {Number} when utc time when the frame was created.
   * @param {}
   */
  add(when, frame, objects) {
    if (!UPLOAD_ENABLED) {
      return;
    }
    this.queue.push({
      when,
      frame,
      objects
    });
    this.start();
  }

  /**
   * To make it easy on the consumer we define metadata as an ordered list... To
   * do this we need to know the previous id we uploaded.
   */
  _resolveLastId() {
    // Specifically checking for undefined so we only run this logic once.
    if (this.previousId !== undefined) {
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

  _uploadItem(previousId, item) {
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
      }
    };

    if (previousId) {
      metadataPayload.previousId = previousId;
    }

    // step 1 is to upload the data...
    return api.blob.upload(VIDEO_BLOB_TYPE, frame.length, VIDEO_CONTENT_TYPE, frame).then(blobUrl => {
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
      return this.stop();
    }

    // Shift an  item off first thing so we don't get stuck in a loop.
    let item = this.queue.shift();
    if (item) {
      log.info('uploading item size: %d, time: %d', item.frame.length, item.when);
    }

    this._resolveLastId().then((previousId) => {
      return this._uploadItem(previousId, item);
    }).catch(err => {
      // XXX: In some cases we may want to retry an upload not now though.
      log.error('Error working item off video upload queue', err);
    }).then(() => {
      if (this.queue.length) {
        // A little trick continue to work but don't use one huge promise chain.
        process.nextTick(() => {
          this._work();
        });
      } else {
        // No more work signal a stop.
        this.stop();
      }
    });
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

module.exports = id => new VideoUploadQueue(id, DURATION_SECONDS * 1000);
