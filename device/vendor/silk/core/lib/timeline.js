/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @flow
 */

import invariant from 'assert';
import EventEmitter from 'events';
import CBuffer from 'CBuffer';
import api from 'silk-device-api';
import createLog from 'silk-log/device';
import {BufferReadable} from 'silk-streams';
import * as util from 'silk-sysutils';

//import * as VideoMetrics from './metrics/video';
import CameraRestart from './metrics/camera_restart';
import EventTracker from './eventtracker';
import { VideoUploadOperation, PreviewUploadOperation } from './outbox';

const log = createLog('timeline');

// persist.silk.vidupload.type defines when video is uploaded:
// * "events" -- only upload video during events
// * "all"    -- upload all video
// * "none"   -- never upload video
const VIDEOUPLOADTYPE_PROP = 'persist.silk.vidupload.type';
const DEFAULT_VIDEOUPLOADTYPE = 'none';

// Default to uploading 1 preview image per second.
const PREVIEW_UPLOAD_INTERVAL_S = util.getintprop('persist.silk.prvupload.interval', 1);
const PREVIEW_UPLOAD_INTERVAL_MS = PREVIEW_UPLOAD_INTERVAL_S * 1000;

// Time between preview image "keyframes".  These are uploaded regardless of the
// value of VIDEOUPLOADTYPE_PROP.
const PREVIEW_KEYFRAME_ENABLED = util.getboolprop('persist.silk.keyframe.enabled', false);
const PREVIEW_KEYFRAME_UPLOAD_INTERVAL_MS = 5 * 60 * 1000; /* 5 minutes */

const PREVIEW_WIDTH = util.getintprop('ro.silk.preview.width', 320);
const PREVIEW_HEIGHT = util.getintprop('ro.silk.preview.height', 180);

// When VIDEOUPLOADTYPE_PROP === 'events', this indicates how much video data
// should be uploaded before the event officially started.
const PRE_EVENT_UPLOAD_MS = 5000;

// The amount of time to collect objects before sending in a batch.
const OBJECT_SEND_INTERVAL_MS = 250;

import type {Outbox} from 'silk-outbox';
import type {ChannelEventEmitter} from './connections';

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
  source: string;
  id?: number;
  name?: string;
  durationMs?: number;
  rects?: Array<Rect>;
};
export type TimelineEventCallback = (when: number, rects: ?Array<Rect>,
    source: string, name: string) => void;

type DiagJpegFrame = {
  id: string;
  when: number;
  jpeg: any; // jpeg image data
};

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

type DataChannels = {
  diag: ChannelEventEmitter;
  mic: ChannelEventEmitter;
  objects: ChannelEventEmitter;
  video: ChannelEventEmitter;
};

/**
 * Class that receives events from various components synchronizes them and send
 * to the server
 *
 * @param outbox Instance of outbox class
 */
export default class Timeline extends EventEmitter {
  outbox: Outbox;
  camera: any;
  channels: DataChannels;

  // Keep track of all objects that are classified in the video stream.
  objects: CBuffer<TimelineEventObject> = new CBuffer(100);

  // Timer that sends objects.
  objectSendTimeout: ?number = null;

  diagJpegFrames: Array<DiagJpegFrame>;
  eventTracker: EventTracker;
  eventTrackerActive: boolean;
  uploadOpQueue: Array<[number, () => void]>;

  liveDiag: boolean = false;
  liveMic: boolean = false;
  liveVideo: boolean = false;
  liveObjects: boolean = false;

  diagFrameFilter: string;
  diagFrameFilterSkips: Array<RegExp>;
  diagFrameFilterNames: Array<RegExp>;
  lastPreviewFrame: ?Buffer;
  lastPreviewFrameWhen: number;
  lastPreviewKeyframeWhen: number;
  lastPreviewEmitMs: number;
  videoUploadType: string;

  _nextObjectId: number = 0;

  constructor(
    outbox: Outbox,
    camera: any, /*TODO: Camera*/
    channels: DataChannels,
  ) {
    super();

    this.outbox = outbox;
    this.channels = channels;

    this.diagJpegFrames = [];
    this.diagFrameFilter = '';
    this.diagFrameFilterNames = [];
    this.diagFrameFilterSkips = [];

    this.lastPreviewFrame = null;
    this.lastPreviewFrameWhen = 0;
    this.lastPreviewKeyframeWhen = 0;
    this.lastPreviewEmitMs = 0;
    this.uploadOpQueue = new CBuffer(PRE_EVENT_UPLOAD_MS / 250); // Hold up to 4 ops per second

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

    // Only enable event tracking if video will be uploaded
    if (this.videoUploadType !== 'none') {
      this.eventTracker = new EventTracker(this.outbox);
      this.eventTracker.on('active', this._onEventTrackerActive);
      this.eventTracker.on('inactive', this._onEventTrackerInactive);
    }

    for (let label in this.channels) {
      switch (label) {
      case 'diag':
      case 'mic':
      case 'objects':
      case 'video':
        // This data is all live, so if the peer can't keep then just drop
        // packets rather than building up a backlog
        this.channels[label].maxBufferedAmount = 1;
        this.channels[label].on('open', this._updateOpenChannels);
        this.channels[label].on('close', this._updateOpenChannels);
        break;
      default:
        invariant(false, label);
      }
    }
    this._updateOpenChannels();

    camera.on('frame', this.addCameraFrame);
    this.on('removeListener', this._onListenerChange);
    this.on('newListener', () => process.nextTick(this._onListenerChange));

    camera.on('face', (when, faces) => {
      this.addFace(when, faces, 'hal');
    });
    camera.on('video-segment', (when, durationMs, pkt) => {
      //api.metrics.add(new VideoMetrics.Record(durationMs));
      //api.metrics.add(new VideoMetrics.CaptureToNode(socketDuration));
      this.addVideo(when, durationMs, pkt);
    });
    camera.on('restart', (why, restartCaptureProcess) => {
      api.metrics.add(new CameraRestart({
        reason: why,
        captureRestart: restartCaptureProcess,
      }));
    });
    this.camera = camera;

    this.channels.diag.on('timeline:cmd', cmd => {
      this.diagCommand(cmd.name, cmd.arg);
    });
  }

  _onListenerChange: (() => void) = () => {
    this.camera.removeListener('fast-frame', this.addCameraFastFrame);
    if (this.listenerCount('preview-fast') > 0) {
      this.camera.on('fast-frame', this.addCameraFastFrame);
    }
  };

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

  getNextObjectId(): number {
    return ++this._nextObjectId;
  }

  _updateOpenChannels = () => {
    const liveDiag = this.channels.diag.open;
    if (!this.liveDiag && liveDiag) {
      this.diagEmitState();
    }
    this.liveDiag = liveDiag;

    this.liveVideo = this.channels.video.open;

    const liveMic = this.channels.mic.open;
    if (!this.liveMic && liveMic) {
      log.info('Enabling mic stream');
      this.camera.on('mic-data', this._onMicData);
    } else if (this.liveMic && !liveMic) {
      log.info('Disabling mic stream');
      this.camera.removeListener('mic-data', this._onMicData);
    }
    this.liveMic = liveMic;

    this.liveObjects = this.channels.objects.open;
    if (this.liveObjects) {
      if (!this.objectSendTimeout) {
        // Send anything we have immediately.
        this._sendObjects();
      }
    } else if (this.objectSendTimeout) {
      clearTimeout(this.objectSendTimeout);
      this.objectSendTimeout = null;
    }

    log.verbose(`Open channels: `);
    for (let label in this.channels) {
      log.verbose(label, this.channels[label].open);
    }
  };

  _onMicData = (msg) => {
    this.channels.mic.emit('pcm', {
      when: msg.when,
      samples: msg.frames,
    });
  };

  diagEmitState(): void {
    const state = {
      imageFilter: this.diagFrameFilter,
    };
    this.channels.diag.emit('timeline:state', state);
  }

  /**
   * Returns the camera preview size.
   *
   * @return {Size}
   */
  get previewSize(): Size {
    return { width: PREVIEW_WIDTH, height: PREVIEW_HEIGHT };
  }

  /**
   * Add a new camera frame
   *
   * @param when    Timestamp of when the preview frame was generated
   * @param preview OpenCV RGB matrix containing the full resolution camera frame
   */
  addCameraFrame: ((when: number, imRGB: any) => void) = (when, imRGB) => {
    this._maybePushPreview(when, imRGB);
    this.emit('preview', when);
  };

  /**
   * Add a new fast camera frame. Note that the fast frame cadence is higher
   * than the regular preview frame.
   *
   * @param when    Timestamp of when the preview frame was generated
   * @param raw frame OpenCV raw matrix containing the full resolution camera frame
   */
  addCameraFastFrame: ((when: number, imRaw: any) => void) = (when, imRaw) => {
    this.emit('preview-fast', when, imRaw);
  };

  /**
   * Checks if a diag frame for the given id is enabled.
   * If disabled, calling addDiagFrame() with the given id will be a no-op.
   *
   * @param id  A simple string to associated with this processed frame
   */
  diagFrameEnabled(id: string): boolean {
    if (this.diagFrameFilterSkips.some(regex => regex.test(id))) {
      return false;
    }
    return this.diagFrameFilterNames.some(regex => regex.test(id));
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
    if (!this.diagFrameEnabled(id)) {
      return;
    }

    if (frame === null) {
      return;
    }

    let [x, y] = frame.size();
    if (x <= 0 || y <= 0) {
      return;
    }

    const jpeg = frame.toBuffer({ext: '.jpg', jpegQuality: 100});
    this.diagJpegFrames.push({id, when, jpeg});
  }

  /***
   * Configure which "diag frames" (added by |addDiagFrame|) are transmitted.
   *
   * @param filter Comma-delimited list of names. The `*` character is wild,
   *               prefix by `-` to exclude.  This is the same syntax as the
   *               DEBUG environment variable used by the npm |debug| module.
   */
  setDiagFrameFilter(filter: string): void {
    let split = filter.split(/[\s,]+/);

    this.diagFrameFilter = filter;
    log.verbose('diagFrameFilter: ', filter);
    this.diagFrameFilterNames = [];
    this.diagFrameFilterSkips = [];
    split.forEach((term) => {
      if (!term) { // empty string
        return;
      }
      term = term.replace(/\*/g, '.*?');
      if (term[0] === '-') {
        this.diagFrameFilterSkips.push(new RegExp('^' + term.substr(1) + '$'));
      } else {
        this.diagFrameFilterNames.push(new RegExp('^' + term + '$'));
      }
    });
    this.diagEmitState();
  }

  diagCommand(name: string, arg: string): void {
    switch (name) {
    case 'imageFilter':
      this.setDiagFrameFilter(arg);
      break;
    default:
      log.warn('Unknown diag command', name);
      break;
    }
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
   * Inject objects into the video stream.
   *
   * @param objects List of objects to be added to the timeline
   */
  addObjects(objects: Array<TimelineEventObject>): void {
    invariant(objects.length);

    objects.forEach((object) => {
      if (!object.id) {
        object.id = this.getNextObjectId();
      }
      invariant(object.source);
      invariant(object.tag);
      if (!object.name) {
        object.name = object.tag; // use tag as name if not specified
      }
      if (!object.when) {
        object.when = this.lastPreviewFrameWhen; // best guess
      }
      if (!object.durationMs) {
        object.durationMs = 0;
      }
      if (!object.rects) {
        object.rects = [];
      }

      log.debug(`Adding object`, object);
      this.objects.push(object);
    });

    this._processEvents(objects);

    if (this.liveObjects && !this.objectSendTimeout) {
      this._sendObjects();
    }
  }

  _sendObjects: (() => void) = () => {
    if (this.objectSendTimeout) {
      clearTimeout(this.objectSendTimeout);
      this.objectSendTimeout = null;
    }
    if (!this.liveObjects) {
      return;
    }

    this.channels.objects.emit('objects', {
      maxsize: this.camera.getFrameSize(),
      now: Date.now(),
      objects: this.objects.toArray(),
    });
    this.objects.empty();

    this.objectSendTimeout =
      setTimeout(this._sendObjects, OBJECT_SEND_INTERVAL_MS);
  };

  /**
   * @private
   */
  _processEvents(objects: Array<TimelineEventObject>) {
    if (this.eventTracker) {
      objects.forEach(object => this.eventTracker.record(object));
    }
    this._emitEvents(objects);
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
   * @private
   */
  _emitEvents(objects: Array<TimelineEventObject>) {
    objects.forEach(object => {
      try {
        this.emit(object.tag, object.when, object.rects, object.source,
            object.name);
      } catch (err) {
        // Escape this call stack then re-throw
        process.nextTick(() => {
          throw err;
        });
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
   * Maybe send a preview frame to live clients and/or storage
   * @private
   */
  _maybePushPreview(when: number, imRGB: any) {
    let diffs = util.uptime(this.lastPreviewEmitMs) / 1000;
    if (diffs < PREVIEW_UPLOAD_INTERVAL_S) {
      return; // Not time to emit a preview yet
    }

    let isKeyFrame = false;
    if (util.uptime(this.lastPreviewKeyframeWhen) >= PREVIEW_KEYFRAME_UPLOAD_INTERVAL_MS) {
      isKeyFrame = PREVIEW_KEYFRAME_ENABLED;
      this.lastPreviewKeyframeWhen = util.uptime();
    }

    log.debug(`Converting matrix to jpg: ${when}`);

    // TODO: Consider moving this image resize off the main thread...
    let im = imRGB.copy();
    im.resize(PREVIEW_WIDTH, PREVIEW_HEIGHT);

    im.toBufferAsync(
      (err, frame) => {
        log.debug(`Finished converting matrix to jpg: ${when}`);
        if (err) {
          this.lastPreviewFrame = null;
          throw err; // TODO: If/when can this actually happen?
        }
        this._pushPreview(when, frame, isKeyFrame);
      },
      {
        ext: '.jpg',
        jpegQuality: 100,
      }
    );

    this.lastPreviewEmitMs = util.uptime();
  }

  /**
   * Send a preview frame to live clients and storage
   *
   * @private
   */
  _pushPreview(when: number, frame: ?Buffer, isKeyFrame: boolean) {
    let usingLastFrame = false;
    if (!frame) {
      if (!this.lastPreviewFrame) {
        // Nothing to push.
        return;
      }
      usingLastFrame = true;
      frame = this.lastPreviewFrame;
      when = this.lastPreviewFrameWhen;
    }

    if (this.diagJpegFrames.length > 0) {
      // TODO: Uncomment and debug perf issues
      //this.channels.diag.emit('timeline:jpegFrames', { jpegFrames: this.diagJpegFrames });
      this.diagJpegFrames = [];
    }

    if (usingLastFrame) {
      return;
    }

    // Storage
    const enqueueOp = () => {
      invariant(frame);
      const op = new PreviewUploadOperation({
        size: frame.length,
        metadata: {
          metaType: 'preview',
          startUTC: when,
          endUTC: when + PREVIEW_UPLOAD_INTERVAL_MS,
          data: {
            frameWidth: PREVIEW_WIDTH,
            frameHeight: PREVIEW_HEIGHT,
          },
        },
      });
      this.outbox.enqueue(this.eventTrackerActive ? 'event_preview' : 'preview',
                          op,
                          new BufferReadable(frame));
    };

    if (isKeyFrame) {
      // This is a preview keyframe, enqueue it right away
      enqueueOp();
    } else {
      // This is not a preview keyframe, maybe enqueue it
      this._addUploadOp(when, enqueueOp);
    }

    this.lastPreviewFrame = frame;
    this.lastPreviewFrameWhen = when;
  }

  /**
   * @private
   */
  _pushVideo(when: number, durationMs: number, frame: Buffer) {
    if (this.liveVideo) {
      this.channels.video.emit('mp4', {
        when,
        deviceEmitMs: Date.now(),
        frame,
        durationMs,
      });
    }

    this._addUploadOp(when,
      () => {
        const op = new VideoUploadOperation({
          size: frame.length,
          metadata: {
            metaType: 'video',
            startUTC: when,
            endUTC: when + durationMs,
          },
        });

        // If for whatever reason this fails it will bubble up to the crash
        // reporter...
        this.outbox.enqueue(this.eventTrackerActive ? 'event_video' : 'video',
          op, new BufferReadable(frame));
      }
    );
  }
}
