/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

let log = require('./log')('timeline');
import { EventEmitter } from 'events';
let util = require('./util');

const DURATION_PROP = 'persist.silk.vidduration';
const DURATION = util.getintprop(DURATION_PROP, 1);
const EVENT_POLL_RATE_MS = DURATION * 1000;

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
    this.eventsPollInterval = null;
  }

  /**
   * Provide the timeline with a socket to use
   */
  set socket(socket) {
    log.warn(`server socket connected`);
    this.serverSocket = socket;

    // Force the last preview image to be transmitted immediately, to provide
    // the client with a preview image as quick as possible when the camera
    // first connects.
    this._pushPreview(null, null);
  }

  /**
   *
   */
  set previewSize(size) {
    this._previewSize = size;
  }

  /**
   *
   */
  addPreview(when, pkt) {
    this.emit('preview', when, pkt);
    this._pushPreview(when, pkt);
  };

  /**
   *
   */
  addVideo(when, pkt) {
    this.videoFrames.push({when: when, pkt: pkt});
  };

  /**
   *
   */
  addFace(when, faces) {
    this.emit('face', faces);
    this._pushFace(when, faces);
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

  _pushPreview(when, frame) {
    // Start polling for objects after the first preview is received
    if (!this.eventsPollInterval) {
      this.eventsPollInterval = setInterval(() => this._waitForEventsDone(),
          EVENT_POLL_RATE_MS);
    }

    // Intentionally delay the preview image by one cycle (~1 second) to ensure
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
  }

  _pushPacket(when, frame, objects, type) {
    let str = `${type} size:${frame ? frame.length : 0} when:${when}ms` +
              ` lag:${Date.now() - when}ms objects:${(objects ? objects.length : 0)}`;
    if (this.serverSocket.connected) {
      log.verbose(str);
      this.serverSocket.emit('video', { id: this.id, objects: objects,
                                        frame: frame, contents: type, when: when });
    } else {
      log.verbose(`dropped ${str}`);
    }
  }

  /**
   * Associate events received so far with the video frames and push them
   * together. This function is run after every {@code EVENT_POLL_RATE_MS}
   */
  _waitForEventsDone() {
    if (this.eventsPollInterval) {
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

      // Drop all the leftover video objects as the corresponding video pkts
      // have already been sent
      this.videoObjects = [];

      // All the video frames are already sent so clear the queue
      this.videoFrames = [];
    }
  }
}

module.exports = id => new Timeline(id);
