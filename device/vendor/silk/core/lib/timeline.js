/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @private
 * @flow
 */

import invariant from 'assert';
import { EventEmitter } from 'events';

import BufferStream from './streams/buffer';
import CBuffer from 'CBuffer';
import EventTracker from './eventtracker';
import { VideoUploadOp, PreviewUploadOp } from './outbox/blob_upload_operation';
import createLog from './log';
import * as util from './sysutils';

const log = createLog('timeline');

// persist.silk.vidupload.type defines when video is uploaded:
// * "events" -- only upload video during events
// * "all"    -- upload all video
// * "none"   -- never upload video
const VIDEOUPLOADTYPE_PROP = 'persist.silk.vidupload.type';
const DEFAULT_VIDEOUPLOADTYPE = 'events';

// Default to uploading 1 preview image per second.
const PREVIEW_UPLOAD_INTERVAL_S = util.getintprop('persist.silk.prvupload.interval', 1);

// Time between preview image "keyframes".  These are uploaded regardless of the
// value of VIDEOUPLOADTYPE_PROP.
const PREVIEW_KEYFRAME_UPLOAD_INTERVAL_MS = 5 * 60 * 1000; /* 5 minutes */

// When VIDEOUPLOADTYPE_PROP === 'events', this indicates how much video data
// should be uploaded before the event officially started.
const PRE_EVENT_UPLOAD_MS = 5000;

import type { Outbox } from './outbox/manager';
import type Server from './server.js';

/**
 * Type representing a timeline event object
 *
 * @property {string} tag Name of the object
 * @property {number} when Timestamp the object(s) manifested in the stream
 * @property {Array<Rect>} rects one or more bounding rectangles for where the
 *           object appeared. The video preview image dimensions are used as
 *           the scale for these rectangles (PREVIEW_WIDTH x PREVIEW_HEIGHT).
 */
export type TimelineEventObject = {
  tag: string;
  when: number;
  [arbitraryKeys: string]: any;
};

type DiagJpegFrame = {
  id: string;
  when: number;
  jpeg: any; // jpeg image data
}

/**
 * Type representing the preview size in width and height
 *
 * @property {number} width preview image width
 * @property {number} height preiview image height
 */
type Size = {
  width: number;
  height: number;
};

/**
 * Type representing an object rectangle
 *
 * @property {number} x x co-ordinate of the object rectangle
 * @property {number} y y co-ordinate of the object rectangle
 * @property {number} width width of the object rectangle
 * @property {number} height height of the object rectangle
 */
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
 * @param outbox Instance of outbox class
 */
export default class Timeline extends EventEmitter {
  outbox: Outbox;
  server: Server;
  _previewSize: Size;
  previewObjects: Array<TimelineEventObject>;
  diagJpegFrames: Array<DiagJpegFrame>;
  cachedObjs: Array<TimelineEventObject>;
  eventTracker: EventTracker;
  eventTrackerActive: boolean;
  uploadOpQueue: Array<[number, () => void]>;

  liveDiag: boolean;
  liveVideo: boolean;
  livePreview: boolean;
  lastPreviewFrame: ?Buffer;
  lastPreviewFrameWhen: number;
  lastPreviewKeyframeWhen: number;
  lastPreviewEmitSeconds: number;
  secondsUntilNextPreviewEmit: number;
  videoUploadType: string;

  constructor(server: Server, outbox: Outbox) {
    super();
    invariant(server, 'must pass server...');
    invariant(outbox, 'must pass outbox...');

    this.outbox = outbox;
    this.server = server;
    this._previewSize = {width: 0, height: 0};

    // Keep track of all objects and upload them along with the
    // metadata for previews (TODO: it would be nice to integrate this into the
    // event system)
    this.previewObjects = [];

    this.diagJpegFrames = [];

    // Keeps a copy of previous objects to be sent when there is no motion detected
    this.cachedObjs = [];

    this.eventTracker = new EventTracker(this.outbox);
    this.eventTracker.on('active', this._onEventTrackerActive);
    this.eventTracker.on('inactive', this._onEventTrackerInactive);

    this.lastPreviewFrame = null;
    this.lastPreviewFrameWhen = 0;
    this.lastPreviewKeyframeWhen = 0;
    this.lastPreviewEmitSeconds = 0;
    this.secondsUntilNextPreviewEmit = PREVIEW_UPLOAD_INTERVAL_S;
    this.uploadOpQueue = new CBuffer(PRE_EVENT_UPLOAD_MS / 250); // Hold up to 4 ops per second

    this.liveVideo = false;
    this.livePreview = false;

    this.videoUploadType = util.getstrprop(VIDEOUPLOADTYPE_PROP,
      DEFAULT_VIDEOUPLOADTYPE);
    switch (this.videoUploadType) {
    case 'events':
    case 'all':
    case 'none':
      break;
    default:
      this.videoUploadType = DEFAULT_VIDEOUPLOADTYPE;
      break;
    }
    log.info('AV upload type:', this.videoUploadType);
  }

  /**
   * @private
   */
  _onEventTrackerActive: ((eventStartWhen: number) => void) = (eventStartWhen) => {
    log.verbose(`event tracker active at ${eventStartWhen}`);
    this.eventTrackerActive = true;

    this.uploadOpQueue.forEach((op, i) => {
      if (!op) {
        return;
      }
      const [when, enqueueOp] = op;
      if (when >= eventStartWhen - PRE_EVENT_UPLOAD_MS) {
        enqueueOp();
      }
    });
    this.uploadOpQueue.empty();
  };

  /**
   * @private
   */
  _onEventTrackerInactive: ((eventStopWhen: number) => void) = (eventStopWhen) => {
    log.verbose(`event tracker inactive at ${eventStopWhen}`);
    this.eventTrackerActive = false;
  };

  /**
   * Selects if transition of the live preview images and/or video should be
   * enabled or not.
   *
   * @param preview Should preview be enabled or not
   * @param video Should video be enabled or not
   * @param diag Should diagnostics be enabled or not
   */
  configLiveStream(preview: boolean, video: boolean, diag: boolean) {
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
    this.liveDiag = diag;
  }

  /**
   * Set size of the preview image
   *
   * @param size Size of the preview image
   */
  set previewSize(size: Size) {
    this._previewSize = size;
  }

  /**
   * Add a new preview frame
   *
   * @param when Timestamp of when the preview frame was generated
   * @param durationMs Expected duration until the next preview frame
   * @param jpeg Buffer containing the preview frame encoded as JPEG
   */
  addPreviewFrame(when: number, durationMs: number, jpeg: Buffer) {
    this._pushPreview(when, durationMs, jpeg);
    this.emit('preview', when);
  }

  /**
   * Add a processed frame
   *
   * @param id  A simple string to associated with this processed frame
   * @param when Timestamp that the frame is correlated with
   * @param frame OpenCV matrix
   */
  addDiagFrame(id: string, when: number, frame: any) {
    if (!this.liveDiag) {
      return;
    }

    const jpeg = frame.toBuffer({ext: '.jpg', jpegQuality: 100});
    this.diagJpegFrames.push({id, when, jpeg});
  }

  /**
   * Add video packet to timeline
   *
   * @param when Timestamp of when the video was generated
   * @param durationMs Duration of the video
   * @param pkt Buffer containing raw video frames
   */
  addVideo(when: number, durationMs: number, pkt: Buffer) {
    this._pushVideo(when, durationMs, pkt);
  }

  /**
   * Handle faces returned by camera HAL
   *
   * @param when Timestamp of when the face was seen
   * @param faces Rectangle co-ordinates of the faces
   * @param source Who found this face, in this case it is always HAL
   */
  addFace(when: number, faces: Array<Rect>, source: string) {
    // Run facial recognition on the detected faces before recording the event
    this.emit('face', when, faces, source);
  }

  /**
   * Add a clap object to timeline
   * @param count of number of claps heard
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
   * @param objects List of objects to be added to the timeline
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

  /**
   * @private
   */
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
   * @param tag Type of the object detected
   * @param [when=last preview timestamp] Time when the object was detected
   * @param [rect=size of preview rectangle] Rectangle co-ordinates of the object
   * @param source Which component is responsible for adding this object
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
   *
   * @param when Timestamp of the preview image in which no motion was detected
   */
  noMotion(when: number) {
    this.emit('no-motion', when);
  }

  /**
   * Add the last cached objects to the provided list of objects
   *
   * @return original objects + cached objects if any
   * @private
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

  /**
   * @private
   */
  _emitEvents(objects: Array<TimelineEventObject>) {
    objects.forEach(object => {
      try {
        this.emit(object.tag, object.when, object.rects, object.source);
      } catch(err) {
        // Escape this call stack then re-throw
        process.nextTick(() => {
          throw err;
        });
      }

      // Clear the cached object list as new objects would be received
      if (object.tag === 'motion') {
        this.cachedObjs = [];
      }
    });
  }

  /**
   * @private
   */
  _addUploadOp(when: number, enqueueOp: (() => void)) {
    switch (this.videoUploadType) {
    case 'all':
      enqueueOp();
      break;
    case 'events':
      if (this.eventTrackerActive) {
        enqueueOp();
      } else {
        this.uploadOpQueue.push([when, enqueueOp]);
      }
      break;
    default:
      break;
    }
  }

  /**
   * @private
   */
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
    const now = Date.now();
    const nowSeconds = Math.floor(now / 1000);
    this.secondsUntilNextPreviewEmit -= nowSeconds - this.lastPreviewEmitSeconds;
    if (this.secondsUntilNextPreviewEmit > 0) {
      return; // Not time to emit a preview yet
    }

    if (this.lastPreviewFrame) {
      // Live stream
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

      if (this.livePreview) {
        this.server.send('video', {
          contents: 'jpeg',
          when: this.lastPreviewFrameWhen,
          frame: this.lastPreviewFrame,
          objects: this._addCachedObjects(this.previewObjects, when),
          durationMs: 0,
        });
      }

      if (this.diagJpegFrames.length > 0) {
        this.server.send('diag', {
          type: 'jpegs',
          log: this.diagJpegFrames,
        });
        this.diagJpegFrames = [];
      }

      // Storage
      const lastPreviewFrame = this.lastPreviewFrame;
      const lastPreviewFrameWhen = this.lastPreviewFrameWhen;
      const previewObjects = this.previewObjects;

      const enqueueOp = () => {
        invariant(lastPreviewFrame);
        const op = new PreviewUploadOp({
          size: lastPreviewFrame.length,
          metadata: {
            metaType: 'preview',
            startUTC: lastPreviewFrameWhen,
            endUTC: lastPreviewFrameWhen + durationMs,
            data: {
              frameWidth: this._previewSize.width,
              frameHeight: this._previewSize.height,
              objects: previewObjects,
            },
          },
        });
        this.outbox.enqueue(this.eventTrackerActive ? 'event_preview' : 'preview',
          op, new BufferStream(lastPreviewFrame));
      };

      if (now - this.lastPreviewKeyframeWhen >= PREVIEW_KEYFRAME_UPLOAD_INTERVAL_MS) {
        // This is a preview keyframe, enqueue it right away
        enqueueOp();
        this.lastPreviewKeyframeWhen = now;
      } else {
        // This is not a preview keyframe, maybe enqueue it
        this._addUploadOp(lastPreviewFrameWhen, enqueueOp);
      }
    }

    this.lastPreviewFrame = frame;
    this.lastPreviewFrameWhen = when;
    this.previewObjects = [];
    this.lastPreviewEmitSeconds = nowSeconds;
    this.secondsUntilNextPreviewEmit = PREVIEW_UPLOAD_INTERVAL_S;
  }

  /**
   * @private
   */
  _pushVideo(when: number, durationMs: number, frame: Buffer) {
    if (this.liveVideo) {
      this.server.emit('video', {
        contents: 'mp4',
        when,
        frame,
        durationMs,
      });
    }

    this._addUploadOp(when,
      () => {
        const op = new VideoUploadOp({
          size: frame.length,
          metadata: {
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
        this.outbox.enqueue(this.eventTrackerActive ? 'event_video' : 'video',
          op, new BufferStream(frame));
      }
    );
  }
}
