/**
 * Copyright (c) 2015 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @flow
 */

import assert from 'assert';
import { EventEmitter } from 'events';

import BufferStream from './streams/buffer';
import EventTracker from './eventtracker';
import { VideoUploadOp, PreviewUploadOp } from './outbox/blob_upload_operation';
import createLog from './log';
import * as util from './sysutils';

const log = createLog('timeline');

const VIDEO_UPLOAD_PROP = 'persist.silk.vidupload.enabled';
const VIDEO_UPLOAD_ENABLED = util.getboolprop(VIDEO_UPLOAD_PROP);

// Default to uploading 1 preview image per second.
const PREVIEW_UPLOAD_INTERVAL_MS = util.getintprop('persist.silk.prvupload.interval', 1) * 1000;

import type { Socket } from 'socket.io-client';
import type { Outbox } from './outbox/manager';

export type TimelineEventObject = {
  tag: string;
  when: number;
  [arbitraryKeys: string]: any;
};

type Size = {
  width: number;
  height: number;
};

type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/**
 * Class that receives events from various components synchronizes them and send
 * to the server
 *
 */
export default class Timeline extends EventEmitter {

  id: string; // deviceId
  outbox: Outbox;
  serverSocket: ?Socket;
  _previewSize: Size;
  previewObjects: Array<TimelineEventObject>;
  cachedObjs: Array<TimelineEventObject>;
  eventTracker: EventTracker;
  liveVideo: boolean;
  livePreview: boolean;
  lastPreviewFrame: ?Buffer;
  lastPreviewFrameWhen: number;
  lastPreviewUploadWhenMs: number;
  acks: {
    pending: {
      jpeg: number;
      mp4: number;
    };
    maxPending: {
      jpeg: number;
      mp4: number;
    }
  };

  constructor(id: string, outbox: Outbox) {
    super();
    assert(outbox, 'must pass outbox...');

    this.id = id;
    this.outbox = outbox;
    this.serverSocket = null;
    this._previewSize = {width: 0, height: 0};

    // Keep track of all objects and upload them along with the
    // metadata for previews (TODO: it would be nice to integrate this into the
    // event system)
    this.previewObjects = [];

    // Keeps a copy of previous objects to be sent when there is no motion detected
    this.cachedObjs = [];

    this.eventTracker = new EventTracker(this.id, this.outbox);

    this.lastPreviewFrame = null;
    this.lastPreviewFrameWhen = 0;
    this.lastPreviewUploadWhenMs = 0;

    this.liveVideo = false;
    this.livePreview = false;

    this._resetAcks();
  }

  /**
   * Provide the timeline with a socket to use
   */
  set socket(socket: ?Socket) {
    if (socket) {
      log.info(`server socket connected`);
      this._resetAcks();
    }
    this.serverSocket = socket;
  }

  _resetAcks() {
    this.acks = {
      pending: { jpeg: 0, mp4: 0 },
      // Number of acks that can be pending before starting to drop live
      // preview images/video chunks.
      maxPending: { jpeg: 4, mp4: 2 },
    };
  }

  /**
   * Selects if transition of the live preview images and/or video should be
   * enabled or not.
   */
  configLiveStream(preview: boolean, video: boolean) {
    if (this.livePreview !== preview) {
      this.livePreview = preview;
      if (this.livePreview) {
        // Force the last preview image to be transmitted immediately, to provide
        // the client with a preview image as quick as possible when the camera
        // first connects.
        this._pushPreview(0, 0, null);
      }
    }
    this.liveVideo = video;
  }

  /**
   *
   */
  set previewSize(size: Size) {
    this._previewSize = size;
  }

  /**
   * JPEG-encoded preview image
   */
  addPreviewJPEG(when: number, durationMs: number, jpeg: Buffer) {
    this._pushPreview(when, durationMs, jpeg);
  }

  /**
   * OpenCV preview frame
   */
  addPreviewFrame(when: number) {
    this.emit('preview', when);
  }

  /**
   *
   */
  addVideo(when: number, durationMs: number, pkt: Buffer) {
    this._pushVideo(when, durationMs, pkt);
  }

  /**
   * Handle faces returned by camera HAL
   */
  addFace(when: number, faces: Array<Rect>, source: string) {
    // Run facial recognition on the detected faces before recording the event
    this.emit('face', when, faces, source);
  }

  /**
   *
   */
  addClap(count: number) {
    this.emit('clap', count);
    this.eventTracker.record({
      tag: 'clap',
      when: Date.now(),
      count,
    });
  }

  /**
   * Inject objects into the video stream.
   *
   * Each object in the provided array should contain the following fields:
   *   tag: object type (string)
   *   when: timestamp the object(s) manifested in the stream
   *   rects: one or more bounding rectangles for where the object appeared:
   *            {x, y, width, height}.
   *          The video preview image dimensions are used as the scale for
   *          these rectangles (PREVIEW_WIDTH x PREVIEW_HEIGHT)
   */
  addObjects(objects: Array<TimelineEventObject>) {
    if (!objects) {
      throw new Error('Invalid objects');
    }

    objects.forEach((object) => {
      // Run facial recognition on the detected faces before adding them
      if (object.tag !== 'face') {
        // Store objects to be used later when there is no motion. Following
        // objects are agnostic to motion so ignore them
        if ((object.source !== 'hal') && (object.source !== 'clapper') &&
            (object.source !== 'trackobject')) {
          this.cachedObjs.push(object);
        }
        this.previewObjects.push(object);
      }
    });
    this._processEvents(objects);
  }

  _processEvents(objects: Array<TimelineEventObject>) {
    objects.forEach((object) => {
      if (object.tag !== 'face') {
        this.eventTracker.record(object);
      }
    });
    this._emitEvents(objects);
  }

  /**
   * Inject an object into the video stream.
   *
   *   tag: object type (string)
   *   when: optional timestamp
   *   rect: optional rectangle
   *
   */
  addObject(tag: string, when: number, rect: Rect, source: string) {
    if (!when) {
      when = this.lastPreviewFrameWhen; // best guess
    }

    if (!rect) {
      const borderPad = 20;
      rect = {
        x: borderPad,
        y: borderPad,
        width: this._previewSize.width - borderPad * 2,
        height: this._previewSize.height - borderPad * 2,
      };
    }

    this.addObjects([{
      tag,
      when,
      rects: [rect],
      source,
    }]);
  }

  /**
   * Notify timeline that there is no motion in the image as compared to the
   * previous image.
   */
  noMotion(when: number) {
    this.emit('no-motion', when);
  }

  /**
   * Add the last cached objects to the provided list of objects
   *
   * @return original objects + cached objects if any
   */
  _addCachedObjects(
    origObjects: ?Array<TimelineEventObject>,
    when: number
  ): ?Array<TimelineEventObject> {
    // Adjust the timestamp of the last cached objects
    let objs = null;
    if (this.cachedObjs.length > 0) {
      objs = this.cachedObjs.map(obj => {
        let newObj = obj;
        newObj.when = when;
        return newObj;
      });
      this._processEvents(objs);
    }

    if (origObjects && objs) {
      return origObjects.concat(objs);
    }
    if (objs) {
      return objs;
    }
    return origObjects;
  }

  _emitEvents(objects: Array<TimelineEventObject>) {
    objects.forEach(object => {
      if (object.tag === 'face') {
        this.emit('face', object.when, object.rects, object.source);
      } else if (object.tag === 'motion') {
        // Clear the cached object list as new objects would be received
        this.cachedObjs = [];
        this.emit('motion', object.when, object.rects);
      } else if (object.tag === 'car') {
        this.emit('car', object.when, object.rects);
      }
    });
  }

  _pushPreview(when: number, durationMs: number, frame: ?Buffer) {
    // Intentionally delay the preview image by one cycle to ensure
    // that the previewObjects are transmitted with their corresponding image.
    //
    // previewObjects are computed after the preview frame is received, so if
    // the preview frame is transmitted as quickly as possible and then a naïve
    // client will end up displaying the previewObjects for last frame.
    //
    // However the `when` timestamp is transmitted to the client for both the
    // preview image and objects so this little workaround can be removed in the
    // future if desired, once the appropriate client changes are made.
    //
    if (this.lastPreviewFrame) {
      for (let obj of this.previewObjects) {
        if (obj.when < this.lastPreviewFrameWhen) {
          log.warn(`Preview object mismatch: ` +
            `object too old by ${this.lastPreviewFrameWhen - obj.when}ms: ` +
            JSON.stringify(obj));
        } else if (obj.when >= when) {
          log.warn(`Preview object mismatch: ` +
            `object too new by ${obj.when - when}ms: ` +
            JSON.stringify(obj));
        }
      }
      this._pushPacket(this.lastPreviewFrameWhen, this.lastPreviewFrame,
                       this.previewObjects, 'jpeg');
    }

    if (VIDEO_UPLOAD_ENABLED &&
        this.lastPreviewFrame &&
        Date.now() - this.lastPreviewUploadWhenMs > PREVIEW_UPLOAD_INTERVAL_MS) {
      const op = new PreviewUploadOp({
        size: this.lastPreviewFrame.length,
        metadata: {
          deviceId: this.id.toString(),
          metaType: 'preview',
          startUTC: this.lastPreviewFrameWhen,
          endUTC: this.lastPreviewFrameWhen + durationMs,
          data: {
            frameWidth: this._previewSize.width,
            frameHeight: this._previewSize.height,
            objects: this.previewObjects,
          },
        },
      });
      // If for whatever reason this fails it will bubble up to the crash
      // reporter...
      this.outbox.enqueue('preview', op, new BufferStream(this.lastPreviewFrame));
      this.lastPreviewUploadWhenMs = Date.now();
    }

    this.lastPreviewFrame = frame;
    this.lastPreviewFrameWhen = when;
    this.previewObjects = [];
  }

  _pushVideo(when: number, durationMs: number, frame: Buffer) {
    this._pushPacket(when, frame, null, 'mp4', durationMs);

    // Only queue the video to be sent to the outbox if uploads are enabled...
    if (!VIDEO_UPLOAD_ENABLED) {
      return;
    }

    const op = new VideoUploadOp({
      size: frame.length,
      metadata: {
        deviceId: this.id.toString(),
        metaType: 'video',
        startUTC: when,
        endUTC: when + durationMs,
        data: {
          frameWidth: this._previewSize.width,
          frameHeight: this._previewSize.height
        },
      },
    });

    // If for whatever reason this fails it will bubble up to the crash
    // reporter...
    this.outbox.enqueue('video', op, new BufferStream(frame));
  }

  _pushPacket(
    when: number,
    frame: Buffer,
    objects: ?Array<TimelineEventObject>,
    type: string,
    durationMs: number = 0
  ) {
    let wouldTransmit = this.serverSocket && this.serverSocket.connected;
    let allObjects;
    switch (type) {
    case 'jpeg':
      wouldTransmit = wouldTransmit && this.livePreview;
      allObjects = this._addCachedObjects(objects, when);
      break;
    case 'mp4':
      wouldTransmit = wouldTransmit && this.liveVideo;
      break;
    default:
      util.processthrow(`Unknown packet type: ${type}`);
    }
    let willTransmit = wouldTransmit;
    let str = `${type} size:${frame ? frame.length : 0} when:${when}ms`;
    if (durationMs) {
      str += ` durationMs:${durationMs}`;
    }
    str += ` lag:${Date.now() - when}ms ` +
           ` objects:${(allObjects ? allObjects.length : 0)}`;

    if (willTransmit) {
      if (this.acks.pending[type] >= this.acks.maxPending[type]) {
        log.warn(`Too many pending acks for ${type}`);
        willTransmit = false;
      }
      str = str + ` acks:${this.acks.pending[type]}`;
    }
    if (willTransmit) {
      log.verbose(str);
      let queued = Date.now();
      // Flow isn't smart enough to realize that `willTransmit`
      // guarantees that `this.serverSocket` is truthy, too.
      // See https://github.com/facebook/flow/issues/998
      this.serverSocket && this.serverSocket.emit('video', {
        id: this.id,
        objects: allObjects,
        frame,
        contents: type,
        when,
        durationMs,
        deviceEmitMs: queued,
      }, () => {
        this.acks.pending[type] -= 1;
        if (this.acks.pending[type] < 0) {
          throw new Error(`pending acks for ${type} < 0`);
        }
        log.info(`ack in ${Date.now() - queued}ms for ${str}`);
      });
      this.acks.pending[type] += 1;
    } else {
      log.verbose(`dropped ${str}`);
      if (wouldTransmit && 'mp4' === type) {
        // In the normal success case, the app meters the `record*`
        // events below.  But for dropped segments, we have to meter
        // these from device.
        //
        // TODO: should we always meter these record events from the
        // device side?
        let segmentId = '' + when;
        this._meter('recordStart', segmentId, when);
        this._meter('recordEnd', segmentId, when + durationMs);
        // Note to clients that the device decided to drop this
        // segment.
        this._meter('deviceDrop', segmentId);
      }
    }
  }

  /**
   * Note to AV pipeline diag clients that event `what` happened for
   * object `id` at timestamp `whenMs`.
   */
  _meter(what: string, id: string, whenMs: number = Date.now()) {
    if (!this.serverSocket || !this.serverSocket.connected) {
      log.debug(`Not metering '${what}' event, socket.io connection not available.`);
      return;
    }
    // TODO: de-dup with app side
    this.serverSocket.emit('diag', {
      id: this.id,
      type: 'avpipeline',
      log: { id, what, whenMs },
    });
  }
}
