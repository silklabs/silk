/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */
/**
 * Copyright (c) 2015 Silk Laboratories, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Laboratories, Inc.
 */

let log = require('./log')('timeline');
import { EventEmitter } from 'events';
let util = require('./util');

// Amount of time to wait for objects to be associated with a video chunk before
// uploading it and any objects that were detected.
const VIDEO_COLLECTOBJECT_DELAY_MS = 500;

/**
 * Class that receives events from various components synchronizes them and send
 * to the server
 *
 */
class Timeline extends EventEmitter {
  constructor(id) {
    super();
    this.id = id;
    this.serverSocket = { connected: false };
    this._previewSize = {width: 0, height: 0};

    // Keep track of all face packets we send and upload them along with the
    // metadata for video segments.
    this.videoObjects = [];

    // previewObjects is like videoObjects, but for the preview images
    this.previewObjects = [];
    this.previewHalFaces = false;

    // Hold all the video frames with the timestamps until the next poll interval
    this.videoFrames = [];

    this.videoUpload = require('./videoupload')(this.id);
  }

  /**
   * Provide the timeline with a socket to use
   */
  set socket(socket) {
    log.warn(`server socket connected`);
    this.serverSocket = socket;
    this.videoUpload.socket = socket;
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
  configLiveStream(preview, video) {
    if (this.livePreview !== preview) {
      this.livePreview = preview;
      if (this.livePreview) {
        // Force the last preview image to be transmitted immediately, to provide
        // the client with a preview image as quick as possible when the camera
        // first connects.
        this._pushPreview(null, null);
      }
    }
    this.liveVideo = video;
  }

  /**
   *
   */
  set previewSize(size) {
    this._previewSize = size;
    this.videoUpload.previewSize = size;
  }

  /**
   * JPEG-encoded preview image
   */
  addPreviewJPEG(when, jpeg) {
    this._pushPreview(when, jpeg);
  };

  /**
   * OpenCV preview frame
   */
  addPreviewFrame(when) {
    this.emit('preview', when);
  };


  /**
   *
   */
  addVideo(when, pkt) {
    this.videoFrames.push({when: when, pkt: pkt});
    setTimeout(this._sendVideoWithObjects.bind(this), VIDEO_COLLECTOBJECT_DELAY_MS);
  };

  /**
   *
   */
  addFace(when, faces) {
    this.emit('face', faces);
    this._pushFace(when, faces);
  };

  /**
   *
   */
  addClap(count) {
    this.emit('clap', count);
  };

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
  addObjects(objects) {
    this.previewObjects.push(...objects);
    this.videoObjects.push(...objects);

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
  addObject(tag, when, rect) {
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
      tag: tag,
      when: when,
      rects: [rect]
    }]);
  }

  /**
   * Notify timeline that there is no motion in the image as compared to the
   * previous image.
   */
  noMotion(when) {
    this.emit('no-motion', when);
  }

  _emitEvents(objects) {
    objects.forEach(object => {
      if (object.tag === 'face') {
        this.emit('face', object.rects);
      } else if (object.tag === 'motion') {
        this.emit('motion', object.when, object.rects);
      } else if (object.tag === 'car') {
        this.emit('car', object.when, object.rects);
      }
    });
  }

  _pushPreview(when, frame) {
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
      for (let o in this.previewObjects) {
        if (o.when < this.lastPreviewFrameWhen ||
            o.when >= when) {
          log.warn(`Preview object sent with wrong image: ${JSON.stringify(o)}`);
        }
      }
      this._pushPacket(this.lastPreviewFrameWhen, this.lastPreviewFrame,
                       this.previewObjects, 'jpeg');
    }
    this.lastPreviewFrame = frame;
    this.lastPreviewFrameWhen = when;
    this.previewObjects = [];
    this.previewHalFaces = false;
  }

  _pushFace(when, faces) {
    let object = {tag: 'hal', when: when, rects: faces};

    // Only add the first set of HAL-detected faces to the preview object set
    // (the HAL can return multiple faces a second, but it's not helpful to show
    //  them all on the preview)
    if (!this.previewHalFaces) {
      this.previewHalFaces = true;
      this.previewObjects.push(object);
    }
    this.videoObjects.push(object);
  }

  _pushVideo(when, frame, objects) {
    // For video we group all related face packets to make it easier on the
    // client.
    this._pushPacket(when, frame, objects, 'mp4');
    this.videoUpload.add(when, frame, this.videoObjects);
  }

  _pushPacket(when, frame, objects, type) {
    let transmit;
    switch (type) {
    case 'jpeg':
      transmit = this.livePreview && this.serverSocket.connected;
      break;
    case 'mp4':
      transmit = this.liveVideo && this.serverSocket.connected;
      break;
    default:
      util.processthrow(`Unknown packet type: ${type}`);
    }
    let str = `${type} size:${frame ? frame.length : 0} when:${when}ms` +
              ` lag:${Date.now() - when}ms ` +
              ` objects:${(objects ? objects.length : 0)}`;

    if (transmit) {
      if (this.acks.pending[type] >= this.acks.maxPending[type]) {
        log.warn(`Too many pending acks for ${type}`);
        transmit = false;
      }
      str = str + ` acks:${this.acks.pending[type]}`;
    }
    if (transmit) {
      log.verbose(str);
      let queued = Date.now();
      this.serverSocket.emit('video',
        { id: this.id, objects: objects, frame: frame, contents: type, when: when },
        () => {
          this.acks.pending[type] = this.acks.pending[type] - 1;
          if (this.acks.pending[type] < 0) {
            throw new Error(`pending acks for ${type} < 0`);
          }
          log.info(`ack in ${Date.now() - queued}ms for ${str}`);
        }
      );
      this.acks.pending[type] = this.acks.pending[type] + 1;
    } else {
      log.verbose(`dropped ${str}`);
    }
  }

  /**
   * Associate events received so far with the video frames and push them
   * together.
   */
  _sendVideoWithObjects() {
    if (this.videoFrames.length > 1) {
      log.error(`Video is backed up: ${this.videoFrames.length} pending uploads`);
    }
    for (let i = 0; i < this.videoFrames.length; i++) {
      let objects = [];

      // Find all events that belong to this video frame
      for (let j = 0; j < this.videoObjects.length; j++) {
        if ((i === (this.videoFrames.length - 1)) &&
            (this.videoFrames[i].when <= this.videoObjects[j].when)) {
          // If it is the last video packet then this object may belong to
          // this video frame
          objects.push(this.videoObjects[j]);
        } else if ((i + 1 <= (this.videoFrames.length - 1)) &&
            ((this.videoFrames[i].when <= this.videoObjects[j].when) &&
             (this.videoFrames[i + 1].when > this.videoObjects[j].when))) {
          // Else find the object that is within the boundary of this frame and
          // the next
          objects.push(this.videoObjects[j]);
        }
      }
      this._pushVideo(this.videoFrames[i].when, this.videoFrames[i].pkt,
                      objects);
    }

    // Drop all the leftover video objects as the corresponding video packets
    // have already been sent
    this.videoObjects = [];

    // All the video frames are already sent so clear the queue
    this.videoFrames = [];
  }
}

module.exports = id => new Timeline(id);
