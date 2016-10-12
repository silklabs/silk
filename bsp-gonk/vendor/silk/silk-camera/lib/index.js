/**
 * Silk Camera module
 *
 * @module silk-camera
 * @example
 * 'use strict';
 *
 * const Camera = require('silk-camera').default;
 * const log = require('silk-alog');
 *
 * let camera = new Camera();
 * camera.init()
 * .then(() => {
 *   camera.startRecording();
 * });
 * camera.on('frame', (when, image) => {
 *   log.info('Received a frame at timestamp', when, '-', image);
 * });
 *
 * @flow
 */

import invariant from 'assert';
import CBuffer from 'CBuffer';
import EventEmitter from 'events';
import * as net from 'net';
import cv from 'opencv';
import * as silkcapture from 'silk-capture';
import createLog from 'silk-log/device';
import * as util from 'silk-sysutils';

import type {Matrix} from 'opencv';
import type {ConfigDeviceMic} from 'silk-config';
import type {VideoCapture, ImageFormat} from 'silk-capture';
import type {Socket} from 'net';

type CameraClipFrameImages = [
  number,
  Matrix,
  Matrix,
  Matrix,
];

type FrameReplacer = {
  reset(): void;
  maybeReplace(
    when: number,
    imRGB: Matrix,
    imGray: Matrix,
    imScaledGray: Matrix
  ): CameraClipFrameImages;
};

/**
 * Type representing an object rectangle
 *
 * @property {number} x x co-ordinate of the object rectangle
 * @property {number} y y co-ordinate of the object rectangle
 * @property {number} width width of the object rectangle
 * @property {number} height height of the object rectangle
 * @memberof silk-camera
 */
type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/**
 * Type representing the camera frame callback
 *
 * @property {boolean} err True if the frame is retrieved succesfully, false
 *                         otherwise
 * @property {object} image Requested preivew image as per the specified
 *                          CameraFrameFormat format
 * @memberof silk-camera
 */
export type CameraCallback = (err: ?Error, image: Matrix) => void;

/**
 * The available camera frame formats:
 *
 * @memberof silk-camera
 * @example
 * fullgray - full resolution grayscale   (CameraFrameSize === 'full')
 * fullrgb  - full resolution rgb         (CameraFrameSize === 'full')
 * highgray - higher res grayscale        (CameraFrameSize === 'high')
 * gray     - normal grayscale            (CameraFrameSize === 'normal')
 * grayeq   - normal grayscale equalized  (CameraFrameSize === 'normal')
 * rgb      - normal rgb                  (CameraFrameSize === 'normal')
 * lowgray  - lower res grayscale         (CameraFrameSize === 'low')
 */
export type CameraFrameFormat =
    'fullgray'
  | 'fullrgb'
  | 'highgray'
  | 'gray'
  | 'grayeq'
  | 'rgb'
  | 'lowgray'
  ;

/**
 * The available camera frame sizes:
 * @memberof silk-camera
 * @example
 * full - full resolution frame
 * high - higher resolution frame for image analysis
 * normal - normal frame size for image analysis
 * low - lower resolution frame for image analysis
 */
export type CameraFrameSize = 'low' | 'normal' | 'high' | 'full';

/**
 * The camera video frame size
 * @memberof silk-camera
 */
type VideoSizeType = {
  width: number;
  height: number;
};

type RawHalFaceType = {
  rect: [number, number, number, number];
  score: number;
  id: number;
  leftEye: [number, number];
  rightEye: [number, number];
  mouth: [number, number];
};

type FaceType = {
  x: number;
  y: number;
  width: number;
  height: number;
  id: number;
  leftEye: [number, number];
  rightEye: [number, number];
};

type PreviewFrameQueueType = {
  userCb: CameraCallback;
  when: number;
  formats: Array<CameraFrameFormat>;
};

type CustomFrameQueueType = {
  format: ImageFormat;
  width: number;
  height: number;
  callback: CameraCallback,
};

type ImageCacheType = {
  when: number;
  fullgray: Matrix;
  fullrgb: Matrix;
  gray: Matrix;
};

type CommandSetParameterType = {
  cmdName: 'setParameter';
  name: string;
  value: string;
};

type CommandInitType = {
  cmdName: 'init';
  cmdData: {
    frames: boolean;
    video: boolean;
    audio: boolean;
    frameIntervalMs: number;
    width: number;
    height: number;
    fps: number;
    vbr: number;
    audioMute: boolean;
    audioSampleRate: number;
    audioChannels: number;
  };
};

type CommandUpdateType = {
  cmdName: 'update';
  cmdData: {
    audioMute: boolean;
  };
};

type CommandGetParameterIntType = {
  cmdName: 'getParameterInt';
  name: string;
};

type CommandGetParameterStrType = {
  cmdName: 'getParameterStr';
  name: string;
};

type CommandTypes = CommandSetParameterType |
                    CommandInitType |
                    CommandUpdateType |
                    CommandGetParameterIntType |
                    CommandGetParameterStrType;

const log = createLog('camera');

const DURATION_PROP = 'persist.silk.video.duration';

// Clamp duration between 100ms and 10s. Any longer and the object metadata
// associated with a video clip could easily get too large for the server to
// handle (silk-device#1054). Defaults to 1s.
const DURATION_MS =
  Math.max(100, Math.min(util.getintprop(DURATION_PROP, 1000), 10000));

const WIDTH = util.getintprop('ro.silk.camera.width', 1280);
const HEIGHT = util.getintprop('ro.silk.camera.height', 720);
const FOCUS_MODE = util.getstrprop('ro.silk.camera.focus_mode', 'continuous-video');
const FPS = util.getintprop('ro.silk.camera.fps', 24);
const VBR = util.getintprop('ro.silk.camera.vbr', 1024);

const FRAME_SCALE_LOW = util.getintprop('ro.silk.camera.scale.low', 5);
const FRAME_SCALE_DEFAULT = util.getintprop('ro.silk.camera.scale', 4);
const FRAME_SCALE_HIGH = util.getintprop('ro.silk.camera.scale.high', 2);

const FRAME_SIZE = {
  low: {
    width: Math.round(WIDTH / FRAME_SCALE_LOW),
    height: Math.round(HEIGHT / FRAME_SCALE_LOW),
  },
  normal: {
    width: Math.round(WIDTH / FRAME_SCALE_DEFAULT),
    height: Math.round(HEIGHT / FRAME_SCALE_DEFAULT),
  },
  high: {
    width: Math.round(WIDTH / FRAME_SCALE_HIGH),
    height: Math.round(HEIGHT / FRAME_SCALE_HIGH),
  },
  full: {
    width: WIDTH,
    height: HEIGHT,
  },
};

// Rate that new camera frames are proceeded.  Ideally this would equal
// 1000/FPS however is usually longer due to limited compute
const FRAME_DELAY_MS = 250; // 4 FPS
const FAST_FRAME_DELAY_MS = 83; // 12 FPS
// After how many fast frames should we grab a preview frame
const GRAB_PREVIEW_FRAME_AFTER = FRAME_DELAY_MS / FAST_FRAME_DELAY_MS;

const FLASH_LIGHT_PROP = 'persist.silk.flash.enabled';
const FLASH_LIGHT_ENABLED = util.getboolprop(FLASH_LIGHT_PROP);

const AUDIO_HW_ENABLED = util.getboolprop('ro.silk.audio.hw.enabled', true);
const CAMERA_HW_ENABLED = util.getboolprop('ro.silk.camera.hw.enabled', true);
const CAMERA_VIDEO_ENABLED = CAMERA_HW_ENABLED && util.getboolprop('ro.silk.camera.video', true);

//
// Constants
//
const CAPTURE_CTL_SOCKET_NAME = '/dev/socket/capturectl';
const CAPTURE_MIC_DATA_SOCKET_NAME = '/dev/socket/capturemic';
const CAPTURE_VID_DATA_SOCKET_NAME = '/dev/socket/capturevid';


// When trying to reestablish contact with the capture process first delay by
// this amount to permit:
// * multiple restart commands to collect - each of the capture socket
// disconnects can cause an independent restart request.
// * the capture process a little bit of time to recover itself if it
// just crashed before attempting to reestablish contact.
const CAPTURE_RESTART_DELAY_MS = 1000;

// Amount of time to give the capture process to initialize before declaring
// the attempt as failed and triggering a retry
const CAPTURE_INIT_TIMEOUT_MS = 30 * 1000;

// If TAG_VIDEO or TAG_MIC is not received in this amount of time assume the
// capture process is wedged and restart it.
const CAPTURE_TAG_TIMEOUT_MS = 10 * 1000;

// If there is still not a camera frame after this number of attempts assume the
// capture process is wedged and restart it.
const CAPTURE_PREVIEW_GRAB_MAX_ATTEMPTS = 5 * (1000 / FRAME_DELAY_MS);

// These constants must match those in Channel.h
const HEADER_NR_BYTES = 20; // sizeof(Channel::Header)
const TAG_VIDEO = 0;
const TAG_FACES = 1;
const TAG_MIC = 2;

const NUM_IMAGES_TO_CACHE = 10;

/**
 * Flash modes as defined in <camera/CameraParameters.cpp>
 * @memberof silk-camera
 */
let FLASH_MODE = {
  OFF: 'off',
  AUTO: 'auto',
  ON: 'on',
  RED_EYE: 'red-eye',
  TORCH: 'torch',
};

/**
 * Return the raw Buffer of bytes `buf` parsed into array of face
 * objects with fields named after `camera_face_t` in
 * system/core/include/system/camera.h.
 * @private
 */
function rawFaceArrayToFaces(buf: Buffer): Array<RawHalFaceType> {
  const SIZEOF_CAMERA_FACE_T = 12 * 4;
  if (buf.length % SIZEOF_CAMERA_FACE_T) {
    throw new Error(`Raw face array has invalid length ${buf.length}`);
  }
  let nrFaces = buf.length / SIZEOF_CAMERA_FACE_T;
  let i32a = new Int32Array(new Uint8Array(buf).buffer);
  let faces = [ ];
  let faceIndex;
  let a = offset => i32a[faceIndex + offset];
  for (let i = 0; i < nrFaces; ++i) {
    let face = { };
    faceIndex = i * (SIZEOF_CAMERA_FACE_T / 4);
    face.rect = [ a(0), a(1), a(2), a(3) ];
    face.score = a(4);
    face.id = a(5);
    face.leftEye = [ a(6), a(7) ];
    face.rightEye = [ a(8), a(9) ];
    face.mouth = [ a(10), a(11) ];
    faces.push(face);
  }
  return faces;
}

/**
 * Normalize face rectangle
 *
 * @private
 */
function normalizeFace(face: RawHalFaceType): FaceType { //eslint-disable-line no-unused-vars

  // These params are defined by the long comment just below the
  // declaration of `struct camera_face` in
  // system/core/include/system/camera.h.
  let [left, top, right, bottom ] = face.rect;
  const TARGET_ORIENTATION = 'landscape';
  // Transform the rectangle to what upstream consumers expect.
  switch (TARGET_ORIENTATION) {
  case 'profile':
    // Rotate-left transform, which works out to
    [ left, top, right, bottom ] = [ top, -right, bottom, -left ];
    break;
  default:
    break;
  }
  // And finally, we transform the abstract "face space" coords into
  // mako device-pixel space with top-left as (0,0)
  let normLen = (l, len) => (len * l / 2000.0) | 0;
  let normCoord = (c, len) => normLen(c + 1000.0, len);

  // Intentionally discard additional HAL face data such as the
  // mouth/score as they are never used downstream.
  const DEFAULT_FRAME_WIDTH = FRAME_SIZE.normal.width;
  const DEFAULT_FRAME_HEIGHT = FRAME_SIZE.normal.height;
  return {
    x: normCoord(left, DEFAULT_FRAME_WIDTH),
    y: normCoord(top, DEFAULT_FRAME_HEIGHT),
    width: normLen(right - left, DEFAULT_FRAME_WIDTH),
    height: normLen(bottom - top, DEFAULT_FRAME_HEIGHT),
    leftEye: [normCoord(face.leftEye[0], DEFAULT_FRAME_WIDTH),
        normCoord(face.leftEye[1], DEFAULT_FRAME_HEIGHT)],
    rightEye: [normCoord(face.rightEye[0], DEFAULT_FRAME_WIDTH),
        normCoord(face.rightEye[1], DEFAULT_FRAME_HEIGHT)],
    id: face.id,
  };
}

/**
 * Class that talks to capture service to receive camera frames
 * @class
 * @memberof silk-camera
 */
export default class Camera extends EventEmitter {

  _liveDiag: boolean = false;
  _audioMute: boolean = false;
  _frameCaptureEnabled: boolean = false;
  _fastFrameCaptureEnabled: boolean = false;
  _fastFrameCount: number = 0;
  _config: ConfigDeviceMic;
  _ready: boolean = false;
  _recording: boolean = false;
  _cvVideoCapture: ?VideoCapture = null;
  _cvVideoCaptureBusy: boolean = false;
  _ctlSocket: ?Socket = null;
  _dataSocket: ?Socket = null;
  _micDataSocket: ?Socket = null;
  _vidDataSocket: ?Socket = null;
  _previewFrameRequests: Array<PreviewFrameQueueType> = [];
  _customFrameRequests: Array<CustomFrameQueueType> = [];
  _noFrameCount: number = 0;
  _frameReplacer: ?FrameReplacer = null;
  _imagecache: CBuffer;
  _initTimeout: ?number = null;
  _frameTimeout: ?number = null;
  _tagMonitorTimeout: ?number = null;
  _restartTimeout: ?number = null;
  _videoTagReceived: ?boolean = null;
  _micTagReceived: ?boolean = null;
  _buffer: string = '';
  _getParameterCallback: ?{resolve: Function, reject: Function} = null;
  faces: Array<FaceType>;

  constructor(config: ConfigDeviceMic) {
    super();
    this._config = Object.assign({
      deviceMic: {
        bytesPerSample: 2,
        encoding: 'signed-integer',
        endian: 'little',
        numChannels: 1,
        sampleRate: 16000,
      }}, config);

    // Cache last few images to guarantee the consumers get the image they are
    // expecting and not the latest camera frame. Also helps prevent resizing a
    // frame multiple times.
    this._imagecache = new CBuffer(NUM_IMAGES_TO_CACHE);
    this._imagecache.overflow = (item) => this._releaseImageCacheEntry(item);

    // Helpful debug output...
    log.verbose('Active frame sizes:');
    for (let frameSize in FRAME_SIZE) {
      log.verbose(`  ${frameSize}: ${JSON.stringify(FRAME_SIZE[frameSize])}`);
    }

    this.on('removeListener', this._onListenerChange);
    this.on('newListener', () => process.nextTick(this._onListenerChange));
  }

  _onListenerChange = () => {
    const frameCaptureEnabled = this.listenerCount('frame') > 0;
    const fastFrameCaptureEnabled = this.listenerCount('fast-frame') > 0;

    // eslint-disable-next-line eqeqeq
    if (frameCaptureEnabled != this._frameCaptureEnabled ||
    // eslint-disable-next-line eqeqeq
        fastFrameCaptureEnabled != this._fastFrameCaptureEnabled) {
      this._frameCaptureEnabled = frameCaptureEnabled;
      this._fastFrameCaptureEnabled = fastFrameCaptureEnabled;
      this._scheduleNextFrameCapture();
    }
  }

  attachFrameReplacer(frameReplacer: FrameReplacer) {
    this._frameReplacer = frameReplacer;
  }

  get FRAME_SIZE(): typeof FRAME_SIZE {
    return FRAME_SIZE;
  }

  get FLASH_MODE(): typeof FLASH_MODE{
    return FLASH_MODE;
  }

  get FRAME_DELAY_MS(): number {
    return FRAME_DELAY_MS;
  }

  get FAST_FRAME_DELAY_MS(): number {
    return FAST_FRAME_DELAY_MS;
  }

  /**
   * True if the device has a camera
   *
   * @memberof silk-camera
   * @instance
   */
  get available(): boolean {
    return CAMERA_HW_ENABLED;
  }

  /**
   * Releases cached images
   * @private
   */
  _releaseImageCacheEntry(item: ImageCacheType) {
    for (let key in item) {
      if (!item.hasOwnProperty(key)) {
        continue;
      }
      switch (key) {
      case 'when':
        break;
      default:
        // Release node-opencv Matrix objects immediately rather than
        // waiting for the GC to claim them.
        if (item[key]) {
          item[key].release();
        }
      }
    }
  }

  /**
   * Restarts communication with the capture process.
   *
   * In certain error conditions, it can also be beneficial to restart the
   * capture process (such as when it is not providing the expected video data)
   * an attempt to recover the system.
   * @private
   */
  _restart(why: string, restartCaptureProcess: boolean = false) {
    if (this._restartTimeout) {
      log.info(`camera restart pending (ignored "${String(why)}")`);
      return;
    }

    log.warn(
      `camera restart: ${why} captureRestart=${String(restartCaptureProcess)}`);

    /**
     * This event is emitted when camera service is restarting
     *
     * @event restart
     * @memberof silk-camera
     * @instance
     * @property {string} why reason for restart
     * @property {boolean} restartCaptureProcess whether to restart capture
     *                     process or not
     */
    this._throwyEmit('restart', why, restartCaptureProcess);
    this._ready = false;

    if (this._initTimeout) {
      clearTimeout(this._initTimeout);
      this._initTimeout = null;
    }

    if (this._frameTimeout) {
      clearTimeout(this._frameTimeout);
      this._frameTimeout = null;
    }
    if (this._tagMonitorTimeout) {
      clearTimeout(this._tagMonitorTimeout);
      this._tagMonitorTimeout = null;
    }
    if (this._cvVideoCapture) {
      this._cvVideoCapture.close();
      this._cvVideoCapture = null;
      this._cvVideoCaptureBusy = false;
    }
    if (this._ctlSocket) {
      this._ctlSocket.destroy();
      this._ctlSocket = null;
    }
    if (this._micDataSocket) {
      this._micDataSocket.destroy();
      this._micDataSocket = null;
    }
    if (this._vidDataSocket) {
      this._vidDataSocket.destroy();
      this._vidDataSocket = null;
    }

    if (restartCaptureProcess) {
      util.setprop('ctl.restart', 'silk-capture');
    }

    this._restartTimeout = setTimeout(() => {
      log.verbose('restart timeout expired, trying to initialize');
      this._restartTimeout = null;
      this._init();
    }, CAPTURE_RESTART_DELAY_MS);
  }

  /**
   * @private
   */
  _initCVVideoCapture() {
    if (!this._cvVideoCapture) {
      try {
        this._cvVideoCapture = new silkcapture.VideoCapture(0,
          FRAME_SIZE.normal.width, FRAME_SIZE.normal.height);
      } catch (err) {
        throw err;
      }
    }
  }

  _initComplete() {
    clearTimeout(this._initTimeout);
    this._initTimeout = null;

    this._ready = true;

    /**
     * This event is emitted when camera has finished intialization
     *
     * @event ready
     * @memberof silk-camera
     * @instance
     */
    this._throwyEmit('ready');
  }

  _startMicCapture() {
    const mic = require('mic');         // eslint-disable-line import/no-require
    let simMic = mic({
      bitwidth: 8 * this._config.deviceMic.bytesPerSample,
      channels: this._config.deviceMic.numChannels,
      encoding: this._config.deviceMic.encoding,
      endian: this._config.deviceMic.endian,
      rate: this._config.deviceMic.sampleRate,
    });
    let micInput = simMic.getAudioStream();
    micInput.on('data', (data) => {
      this._throwyEmit('mic-data', { when: Date.now(), frames: data });
    });
    micInput.on('error', (error) => {
      // TODO: what should we do on errors ...
      log.error(`Sim mic error: ${error}`);
    });
    simMic.start();
  }

  /**
   * Emit an event, and re-throw any exceptions to the process once the current
   * call stack is unwound.
   *
   * @private
   */
  _throwyEmit(eventName: string, ...args: Array<any>) {
    try {
      this.emit(eventName, ...args);
    } catch (err) {
      process.nextTick(() => {
        util.processthrow(err.stack || err);
      });
    }
  }

  /**
   * @private
   */
  _init() {
    if (this._ready) {
      log.warn(`camera already initialized`);
      return;
    }
    if (this._initTimeout) {
      log.warn(`camera actively initializing`);
      return;
    }
    this._initTimeout = setTimeout(() => {
      this._initTimeout = null;
      this._restart('failed to initialize in a timely fashion', true);
    }, CAPTURE_INIT_TIMEOUT_MS);

    if (this._frameReplacer) {
      this._frameReplacer.reset();
    }

    if (process.platform !== 'android') {
      // The capture process is currently gonk only.  For other platforms only initialize
      // OpenCV video capture.
      process.nextTick(() => {
        this._startMicCapture();
        this._initComplete();
        if (CAMERA_HW_ENABLED) {
          this._initCVVideoCapture();
          this._scheduleNextFrameCapture();
        }
      });
      return;
    }

    // Connecting to data socket
    this._connectDataSocket(this._micDataSocket, CAPTURE_MIC_DATA_SOCKET_NAME);
    this._connectDataSocket(this._vidDataSocket, CAPTURE_VID_DATA_SOCKET_NAME);

    // Connecting to control socket
    log.verbose(`connecting to ${CAPTURE_CTL_SOCKET_NAME} socket`);
    this._ctlSocket = net.createConnection(CAPTURE_CTL_SOCKET_NAME, () => {
      log.verbose(`connected to ${CAPTURE_CTL_SOCKET_NAME} socket`);

      if (CAMERA_HW_ENABLED) {
        this._initCVVideoCapture();
      }

      this._buffer = '';
      const cmdData = {
        frames: CAMERA_HW_ENABLED,
        video: CAMERA_VIDEO_ENABLED,
        audio: AUDIO_HW_ENABLED,
        frameIntervalMs: DURATION_MS,
        width: WIDTH,
        height: HEIGHT,
        fps: FPS,
        vbr: VBR,
        audioMute: this._audioMute,
        audioSampleRate: this._config.deviceMic.sampleRate,
        audioChannels: this._config.deviceMic.numChannels,
      };

      this._command({cmdName: 'init', cmdData});
    });
    const ctlSocket = this._ctlSocket;
    invariant(ctlSocket);

    ctlSocket.on('data', data => this._onCtlSocketRead(data));
    ctlSocket.on('error', err => {
      this._restart(`camera control socket error, reason=${err}`);
    });
    ctlSocket.on('close', hadError => {
      if (!hadError) {
        this._restart(`camera control socket close`);
      }
    });
  }

  /**
   * @private
   */
  _tagMonitor = () => {
    if ( (this._videoTagReceived || !CAMERA_VIDEO_ENABLED) &&
         (this._micTagReceived || !AUDIO_HW_ENABLED) ) {
      this._videoTagReceived = this._micTagReceived = null;
      this._tagMonitorTimeout = setTimeout(this._tagMonitor, CAPTURE_TAG_TIMEOUT_MS);
      return;
    }
    this._restart(
      `Expected Tags not received from capture promptly. ` +
      `video=${String(this._videoTagReceived)}, ` +
      `mic=${String(this._micTagReceived)}`,
      true
   );
  };

  /**
   * @private
   */
  _onCtlSocketRead(data: string) {
    log.verbose(`received ctl data: ${data.toString()}`);
    this._buffer += data.toString();

    let nullByte;
    while ((nullByte = this._buffer.indexOf('\0')) !== -1) {
      let line = this._buffer.substring(0, nullByte);
      this._buffer = this._buffer.substring(nullByte + 1);

      let found;
      if ((found = line.match(/^([\d]*) (.*)/))) {
        line = found[2];
      }

      let captureEvent = JSON.parse(line);
      if (captureEvent.eventName === 'error') {
        log.warn('Camera command errored out'); // Not much to do here really
      } else if (captureEvent.eventName === 'initialized') {
        this._tagMonitorTimeout = setTimeout(this._tagMonitor, CAPTURE_TAG_TIMEOUT_MS);
        this._initComplete();

        if (CAMERA_HW_ENABLED) {
          this._command({cmdName: 'setParameter', name: 'focus-mode', value: FOCUS_MODE});
          this._scheduleNextFrameCapture();
        }
      } else if (captureEvent.eventName === 'getParameter') {
        if (this._getParameterCallback) {
          this._getParameterCallback.resolve(captureEvent.data);
          this._getParameterCallback = null;
        }
      } else if (captureEvent.eventName === 'stopped') {
        throw new Error('Camera stop unhandled');
      } else {
        log.warn(`Error: Unknown capture event ${line}`);
      }
    }
  }

  /**
   * @private
   */
  _retrieveNextFrame() {
    if (this._previewFrameRequests.length === 0) {
      return;
    }

    // Dequeue the next frame request
    let {userCb, when, formats} = this._previewFrameRequests.shift();

    // Search the image in the cache
    let index = 0;
    for (index = 0; index < this._imagecache.size; index++) {
      let image = this._imagecache.get(index);
      if (image.when !== when) {
        continue;
      }

      let err = null;

      let frames = formats.map(format => { //eslint-disable-line no-loop-func
        switch (format) {
        case 'fullrgb':
          return image.fullrgb;
        case 'rgb':
          if (!image.rgb) {
            let rgb = image.fullrgb.copy();
            rgb.resize(FRAME_SIZE.normal.width, FRAME_SIZE.normal.height); // Slow!
            image.rgb = rgb;
          }
          return image.rgb;
        case 'fullgray':
          return image.fullgray;
        case 'highgray':
          if (!image.highgray) {
            let highgray = image.fullgray.copy();
            highgray.resize(FRAME_SIZE.high.width, FRAME_SIZE.high.height);
            image.highgray = highgray;
          }
          return image.highgray;
        case 'gray':
          return image.gray;
        case 'grayeq':
          if (!image.grayeq) {
            let grayImage = image.gray.copy();
            grayImage.equalizeHist();
            image.grayeq = grayImage;
          }
          return image.grayeq;
        case 'lowgray':
          if (!image.lowgray) {
            // TODO: Resize from fullgray instead?  This will be slower but
            // likely produce a better image.
            let lowgray = image.gray.copy();
            lowgray.resize(FRAME_SIZE.low.width, FRAME_SIZE.low.height);
            image.lowgray = lowgray;
          }
          return image.lowgray;
        default:
          err = new Error(`unsupported format: ${format}`);
          return null;
        }
      });

      userCb(err, frames);
      return;
    }
    userCb(new Error('image not available in the cache'), null);
  }

  /**
   * Fast preview frames are scheduled every FAST_FRAME_DELAY_MS and preview
   * frames are scheduled every GRAB_PREVIEW_FRAME_AFTER many fast frames
   *
   * @private
   */
  _scheduleNextFrameCapture() {
    if (!this._ready || this._frameTimeout) {
      return;
    }

    let delayMs;
    if (this._fastFrameCaptureEnabled) {
      delayMs = FAST_FRAME_DELAY_MS;
    } else if (this._frameCaptureEnabled) {
      delayMs = FRAME_DELAY_MS;
    } else {
      return;
    }

    const spilloverMs = Date.now() % delayMs;

    // Reduce delayMs by the spillover to get the next frame as close
    // as possible to +delayMs
    // (+5 to ensure the timeout doesn't fire early by ~1ms)
    const requestedDelayMs = delayMs - spilloverMs + 5;

    this._frameTimeout = setTimeout(async () => {
      this._frameTimeout = null;
      let isFastFrame = false;
      if (this._fastFrameCaptureEnabled) {
        this._fastFrameCount++;
        // Grab preview frame if it's time to do so
        if (this._fastFrameCount >= GRAB_PREVIEW_FRAME_AFTER) {
          this._fastFrameCount = 0;
        } else {
          isFastFrame = true;
        }
      }
      this._captureFrame(isFastFrame);
      this._scheduleNextFrameCapture();
    }, requestedDelayMs);
  }

  /**
   * Read the next frame
   *
   * @param fastFrameOnly : Only emit the fast frame data if true, false for the full * frame data
   * @private
   */
  _captureFrame(fastFrameOnly: boolean) {
    const cvVideoCapture = this._cvVideoCapture;
    if (!cvVideoCapture || !this._recording) {
      return;
    }
    if (this._cvVideoCaptureBusy) {
      if (!fastFrameOnly) {
        this._noFrameCount++;
        log.warn(`Waiting for camera frame: ` +
                 `${this._noFrameCount}/${CAPTURE_PREVIEW_GRAB_MAX_ATTEMPTS}`);
        if (this._noFrameCount > CAPTURE_PREVIEW_GRAB_MAX_ATTEMPTS) {
          this._restart(`Camera frame timeout`, true);
        }
      }
      return;
    }
    if (!fastFrameOnly) {
      this._noFrameCount = 0;
    }
    this._cvVideoCaptureBusy = true;
    let when = Date.now();

    let im = new cv.Matrix();
    if (fastFrameOnly) {
      cvVideoCapture.read(im, (err) => {
        if (err) {
          log.warn(`Unable to fetch frame: err=${err}`);
        } else {
          this._handleNextFastFrame(when, im);
        }
        this._cvVideoCaptureBusy = false;
        this._handleCustomFrameRequest();
      });
    } else {
      let imRGB = new cv.Matrix();
      let imGray = new cv.Matrix();
      let imScaledGray = new cv.Matrix();
      cvVideoCapture.read(im, imRGB, imGray, imScaledGray, (err) => {
        if (err) {
          log.warn(`Unable to fetch frame: err=${err.message}`);
        } else {
          this._handleNextFastFrame(when, im);
          this._handleNextPreviewFrame(when, imRGB, imGray, imScaledGray);
        }
        this._cvVideoCaptureBusy = false;
        this._handleCustomFrameRequest();
      });
    }
  }

  /**
   * Read the next frame in the specified format and size
   * @private
   */
  _captureFrameCustom(
    format: ImageFormat,
    width: number,
    height: number,
    callback: CameraCallback
  ) {
    if (!this._cvVideoCapture || !this._recording) {
      callback(new Error(`capture not ready`));
      return;
    }
    if (this._cvVideoCaptureBusy) {
      // Queue the request if the capture process is busy
      this._customFrameRequests.push({
        format,
        width,
        height,
        callback,
      });
      return;
    }
    this._cvVideoCaptureBusy = true;
    let im = new cv.Matrix();
    this._cvVideoCapture.readCustom(im, format, width, height, (err) => {
      callback(err, im);
      this._cvVideoCaptureBusy = false;
      this._handleCustomFrameRequest();
    });
  }

  /**
   * Service any pending custom frame requests if any
   * @private
   */
  _handleCustomFrameRequest() {
    if (this._customFrameRequests.length === 0) {
      return;
    }

    // Dequeue the next frame request
    let {format, width, height, callback} = this._customFrameRequests.shift();
    this._captureFrameCustom(format, width, height, callback);
  }

  /**
   * Handle the next preview frame
   * @private
   */
  _handleNextPreviewFrame(
    when: number,
    imRGB: Matrix,
    imGray: Matrix,
    imScaledGray: Matrix
  ) {
    if (this._frameReplacer) {
      [when, imRGB, imGray, imScaledGray] =
        this._frameReplacer.maybeReplace(when, imRGB, imGray, imScaledGray);
    }

    // Cache the camera frame
    this._imagecache.push({
      when,
      fullgray: imGray,
      fullrgb: imRGB,
      gray: imScaledGray,
    });

    log.debug(`Grab time: ${Date.now() - when}ms`);

    /**
     * This event is emitted when a preview frame (4 FPS) is available.
     *
     * @event frame
     * @memberof silk-camera
     * @instance
     * @property {number} when Timestamp of the preview frame in UTC milliseconds
     *                         since epoch
     * @property {Object} imRGB {@link https://github.com/peterbraden/node-opencv Opencv}
     *                          matrix representing the image in RGB format
     */
    this._throwyEmit('frame', when, imRGB);

    // Only emit the latest set of HAL-detected faces
    // (HAL can return multiple faces per preview, but it's not helpful to show
    //  them all on the preview)
    if (this.faces) {
      if (this.faces.length > 0) {
        log.info(`Detected face=${this.faces.length}`);
      }
      this._throwyEmit('faces', when, this.faces);
    }
  }

  /**
   * Handle the next fast frame
   * @private
   */
  _handleNextFastFrame(when: number, im: Matrix) {
    /**
     * This event is emitted when a fast preview frame (12 FPS) is available.
     *
     * @event fast-frame
     * @memberof silk-camera
     * @instance
     * @property {number} when Timestamp of the preview frame in UTC milliseconds
     *                         since epoch
     * @property {Object} im {@link https://github.com/peterbraden/node-opencv Opencv}
     *                          matrix representing the image in raw YVU420SP format
     */
    this._throwyEmit('fast-frame', when, im);
  }

  /**
   * @private
   */
  _connectDataSocket(_dataSocket: ?Socket, socketName: string) {
    let _dataBuffer = null;
    log.verbose(`connecting to ${socketName} socket`);
    this._dataSocket = net.createConnection(socketName, () => {
      log.verbose(`connected to ${socketName} socket`);
      _dataBuffer = null;
    });
    const dataSocket = this._dataSocket;
    invariant(dataSocket);

    dataSocket.on('error', err => {
      this._restart(`camera data socket error, reason=${err}`);
    });
    dataSocket.on('close', hadError => {
      if (!hadError) {
        this._restart(`camera data socket close`);
      }
    });
    dataSocket.on('data', (newdata) => {
      let buf;
      if (_dataBuffer) {
        // Prepend previous incomplete packet
        buf = Buffer.concat([_dataBuffer, newdata]);
      } else {
        buf = newdata;
      }

      let pos = 0;
      while (pos + HEADER_NR_BYTES < buf.length) {
        let size = buf.readInt32LE(pos);
        if (pos + HEADER_NR_BYTES + size > buf.length) {
          break; // Incomplete packet received
        }
        let tag = buf.readInt32LE(pos + 4);
        let now = tag === TAG_VIDEO ? Date.now() : null;
        let sec = buf.readInt32LE(pos + 8);   // timeval.tv_sec
        let usec = buf.readInt32LE(pos + 12); // timeval.tv_usec
        let durationMs = buf.readInt32LE(pos + 16);
        let when = sec * 1000 + Math.round(usec / 1000); // UTC ms since epoch

        let pkt = buf.slice(pos + HEADER_NR_BYTES, pos + HEADER_NR_BYTES + size);

        let tagInfo = `| size:${size} when:${sec}.${usec} durationMs:${durationMs}`;
        switch (tag) {
        case TAG_VIDEO:
          {
            log.debug(`TAG_VIDEO ${when}`, tagInfo);
            this._videoTagReceived = true;
            invariant(now);
            let socketDuration = now - when - durationMs;

            if (socketDuration < 0) {
              log.debug(`Bad socketDuration: ${socketDuration}`);
              socketDuration = 0;
            }
            log.debug(`socketDuration: ${socketDuration}`);

            if (this._recording) {
              /**
               * This event is emitted when a MPEG4 video segement is available
               *
               * @event video-segment
               * @memberof silk-camera
               * @instance
               * @property {number} when Timestamp of the video segment in UTC milliseconds
               *                         since epoch
               * @property {number} durationMs duration in milliseconds of the
               *                    video segment
               * @property {Object} pkt mpeg4 data
               */
              this._throwyEmit('video-segment', when, durationMs, pkt);
            }
          }
          break;
        case TAG_FACES:
          log.debug(`TAG_FACES ${when}`, tagInfo);
          if (this._recording) {
            this.faces = rawFaceArrayToFaces(pkt).map(normalizeFace);
          }
          break;
        case TAG_MIC:
          log.debug(`TAG_MIC ${when}`, tagInfo);
          this._micTagReceived = true;

          /**
           * This event is emitted when microhpone data is available
           *
           * @event mic-data
           * @memberof silk-camera
           * @instance
           * @type {Object}
           * @property {number} when Timestamp of the mic data in UTC milliseconds
           *                         since epoch
           * @property {Buffer} frames buffer containing the mic data
           */
          if (this._recording) {
            this._throwyEmit('mic-data', {when: when, frames: pkt});
          }
          break;
        default:
          // Flush the buffer and restart the socket
          _dataBuffer = null;
          this._restart('Invalid capture tag', true);
          throw new Error(`Invalid capture tag #${tag}`, tagInfo);
        }
        pos += HEADER_NR_BYTES + size;
      }
      if (pos !== buf.length) {
        _dataBuffer = buf.slice(pos); // Save partial packet for next time
      } else {
        _dataBuffer = null;
      }
    });
  }

  /**
   * @private
   */
  _command(cmd: CommandTypes) {
    const ctlSocket = this._ctlSocket;
    if (ctlSocket === null) {
      log.warn(`Null ctlSocket, ignoring ${JSON.stringify(cmd)}`);
      return false;
    }
    // Camera socket expects the command data in the following format
    let event = JSON.stringify(cmd) + '\0';

    invariant(ctlSocket);
    ctlSocket.write(event);
    log.verbose(`camera << ${event}`);
    return true;
  }

  /**
   * Initialize camera stream
   *
   * @memberof silk-camera.Camera
   * @instance
   */
  async init() {
    this._init();
    return Promise.resolve();
  }

  /**
   * Block until the camera is online and operational.
   * IMPORTANT: Since the camera can crash at any time, once this method returns
   *            it's never guaranteed that the camera is STILL online
   *
   * @return {Promise}
   * @memberof silk-camera.Camera
   * @instance
   */
  /* async */ ready() {
    if (this._ready) {
      return Promise.resolve();
    }
    return new Promise(resolve => {
      this.once('ready', resolve);
    });
  }

  /**
   * Start camera recording
   *
   * @memberof silk-camera.Camera
   * @instance
   */
  startRecording() {
    if (!this._recording) {
      this._recording = true;
      log.verbose(`recording enabled (ready=${String(this._ready)}`);
    }
  }

  /**
   * Stop camera recording
   *
   * @memberof silk-camera.Camera
   * @instance
   */
  stopRecording() {
    if (this._recording) {
      this._recording = false;
      log.verbose(`recording disabled (ready=${String(this._ready)})`);
    }
  }

  /**
   * Set flash mode as specified by flashMode parameter
   *
   * @param flashMode flash-mode parameter to set in camera
   * @memberof silk-camera.Camera
   * @instance
   */
  flash(flashMode: string) {
    if (!FLASH_LIGHT_ENABLED) {
      log.warn(`flash light is not enabled`);
      return;
    }
    if (!this._ready) {
      log.error(`camera not ready, ignoring flash command`);
      return;
    }
    this._command({cmdName: 'setParameter', name: 'flash-mode', value: flashMode});
  }

  /**
   * Set mute mode
   *
   * @param mute Mute mic true or false
   * @memberof silk-camera.Camera
   * @instance
   */
  setMute(mute: boolean) {
    // Persist mute setting if changed
    if (this._audioMute !== mute) {
      this._audioMute = mute;
    }

    if (!this._ready) {
      return;
    }
    this._command({cmdName: 'update', cmdData: {audioMute: this._audioMute}});
  }

  /**
   * Get integer camera parameter. This function returns a Promise that resolves
   * when the parameter value is successfully retrieved
   *
   * @param name of camera parameter to get
   * @return {Promise}
   * @memberof silk-camera.Camera
   * @instance
   */
  async getParameterInt(name: string) {
    if (this._getParameterCallback) {
      throw new Error(`Re-entered getParameter?`);
    }
    if (!this._ready) {
      throw new Error(`camera not ready, ignoring getParameterInt command`);
    }

    if (!this._command({cmdName: 'getParameterInt', name})) {
      if (process.platform !== 'android') {
        if (name === 'max-num-detected-faces-hw') {
          return 0;
        }
      }
      throw new Error('Unable to issue command');
    }
    let getParamPromise = new Promise((resolve, reject) => {
      this._getParameterCallback = { resolve, reject };
    });
    return await getParamPromise;
  }

  /**
   * Get string camera parameter. This function returns a Promise that resolves
   * when the parameter value is successfully retrieved
   *
   * @param name of camera parameter to get
   * @return {Promise}
   * @memberof silk-camera.Camera
   * @instance
   */
  async getParameterStr(name: string) {
    if (this._getParameterCallback) {
      throw new Error(`Re-entered getParameter?`);
    }
    if (!this._ready) {
      throw new Error(`camera not ready, ignoring getParameterStr command`);
    }

    if (!this._command({cmdName: 'getParameterStr', name})) {
      throw new Error('Unable to issue command');
    }
    let getParamPromise = new Promise((resolve, reject) => {
      this._getParameterCallback = { resolve, reject };
    });
    return await getParamPromise;
  }

  /**
   * Returns the camera video size.
   *
   * @return {VideoSizeType}
   * @memberof silk-camera.Camera
   * @instance
   */
  get videoSize(): VideoSizeType {
    return { width: WIDTH, height: HEIGHT };
  }

  /**
   * Returns the camera frame size.
   *
   * @param frameSize Frame size of interest ('normal' if null)
   * @return {Size}
   * @memberof silk-camera.Camera
   * @instance
   */
  getFrameSize(frameSize?: CameraFrameSize) {
    frameSize = frameSize || 'normal';
    if (typeof FRAME_SIZE[frameSize] !== 'object') {
      throw new Error(`Invalid frameSize: ${frameSize}`);
    }
    return FRAME_SIZE[frameSize];
  }

  /**
   * @private
   */
  static _scaleRect(rect: Rect, scale: number): Rect {
    return {
      x: Math.round(rect.x * scale),
      y: Math.round(rect.y * scale),
      width: Math.round(rect.width * scale),
      height: Math.round(rect.height * scale),
    };
  }

  /**
   * Scales normalized rectangles to the specified CameraFrameSize
   *
   * @param rects Array of normalized rectangles to scale
   * @param frameSize Desired scale
   * @return Array of rectangles in the desired scale
   * @memberof silk-camera.Camera
   * @instance
   */
  normalRectsTo(rects: Array<Rect>, frameSize: CameraFrameSize): Array<Rect> {
    const scale = this.getFrameSize(frameSize).width / FRAME_SIZE.normal.width;
    return rects.map(rect => Camera._scaleRect(rect, scale));
  }

  /**
   * Scales rectangles of the specified CameraFrameSize to the normal size
   *
   * @param rects Array of rectangles to normalize
   * @param frameSize Desired scale
   * @return Array of normalized rectangles
   * @memberof silk-camera.Camera
   * @instance
   */
  normalRectsFrom(rects: Array<Rect>, frameSize: CameraFrameSize): Array<Rect> {
    const scale = FRAME_SIZE.normal.width / this.getFrameSize(frameSize).width;
    return rects.map(rect => Camera._scaleRect(rect, scale));
  }


  /**
   * @private
   */
  _getFrame(
    when: number,
    formats: Array<CameraFrameFormat>,
    userCb: CameraCallback
  ): void {
    this._previewFrameRequests.push({userCb, when, formats});
    this._retrieveNextFrame();
  }

  /**
   * Obtain a camera frame in one or more formats
   *
   * @param when timestamp of the frame to get
   * @param formats requested formats
   *
   * @return {Promise<Array<?cv::Matrix>>}
   * @memberof silk-camera.Camera
   * @instance
   */
  getFrame(
    when: number,
    formats: Array<CameraFrameFormat>
  ): Promise<Array<Matrix>> {
    return new Promise((resolve, reject) => {
      this._getFrame(when, formats, (err, frames) => {
        if (err) {
          reject(err);
        } else {
          resolve(frames);
        }
      });
    });
  }

  /**
   * Obtain the next camera frame in the specified format and size
   *
   * @param format - requested format
   * @param width  - width of the requested frame
   * @param height - height of the requested frame
   *
   * @return {Promise<?cv::Matrix>}
   * @memberof silk-camera.Camera
   * @instance
   */
  getNextFrame(format: ImageFormat, width: number, height: number): Promise<?any> {
    return new Promise((resolve, reject) => {
      this._captureFrameCustom(format, width, height, (err, frame) => {
        if (err) {
          reject(err);
        } else {
          resolve(frame);
        }
      });
    });
  }
}
