/**
 * @private
 * @flow
 */

import invariant from 'assert';
import CBuffer from 'CBuffer';
import EventEmitter from 'events';
import * as net from 'net';
import cv from 'opencv';
import * as silkcapture from 'silk-capture';
import createLog from 'silk-log';
import * as util from 'silk-sysutils';

import type {Socket} from 'net';
import type {Matrix} from 'opencv';
import type {VideoCapture, ImageFormat} from 'silk-capture';
import type {ConfigDeviceMic} from 'silk-mic-config';

type CameraConfig = {
  deviceMic: ConfigDeviceMic;
};

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
 * @property x x co-ordinate of the object rectangle
 * @property y y co-ordinate of the object rectangle
 * @property width width of the object rectangle
 * @property height height of the object rectangle
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
 * @property {Error} err True if the frame is retrieved succesfully, false
 *                         otherwise
 * @property {Matrix} image Requested preivew image as per the specified
 *                          CameraFrameFormat format
 * @memberof silk-camera
 */
export type CameraCallback = (err: ?Error, image: Matrix) => void;

/**
 * The available camera frame formats:
 *
 * <ul>
 * <li>fullgray - full resolution grayscale (CameraFrameSize === 'full')</li>
 * <li>fullrgb - full resolution rgb (CameraFrameSize === 'full')</li>
 * <li>highgray - higher res grayscale (CameraFrameSize === 'high')</li>
 * <li>gray - normal grayscale (CameraFrameSize === 'normal')</li>
 * <li>grayeq - normal grayscale equalized (CameraFrameSize === 'normal')</li>
 * <li>rgb - normal rgb (CameraFrameSize === 'normal')</li>
 * <li>lowgray - lower res grayscale (CameraFrameSize === 'low')</li>
 * </ul>
 * @memberof silk-camera
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
 * <ul>
 * <li>full - full resolution frame</li>
 * <li>high - higher resolution frame for image analysis</li>
 * <li>normal - normal frame size for image analysis</li>
 * <li>low - lower resolution frame for image analysis</li>
 * </ul>
 * @memberof silk-camera
 */
export type CameraFrameSize = 'low' | 'normal' | 'high' | 'full';

/**
 * The camera frame size
 * @memberof silk-camera
 */
type SizeType = {
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

/**
 * The available image formats:
 *
 * @name ImageFormat
 * @property {yvu420sp|rgb} ImageFormat image format
 * @memberof silk-camera
 */

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
    videoSegmentLength: number;
    cameraId: number;
    width: number;
    height: number;
    fps: number;
    vbr: number;
    audioMute: boolean;
    audioSampleRate: number;
    audioChannels: number;
    cameraParameters: {[key: string]: string};
  };
};

type CommandStopType = {
  cmdName: 'stop';
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
                    CommandStopType |
                    CommandUpdateType |
                    CommandGetParameterIntType |
                    CommandGetParameterStrType;

const log = createLog('camera');

const VIDEO_SEGMENT_DURATION_SECS =
  Math.max(1, Math.min(util.getintprop('persist.silk.video.duration', 5), 30));

const CAMERA_ID = util.getintprop('ro.silk.camera.id', 0);

const FPS = util.getintprop('ro.silk.camera.fps', 24);
const VBR = util.getintprop('ro.silk.camera.vbr', 1024);

const FRAME_SCALE_LOW = util.getintprop('ro.silk.camera.scale.low', 5);
const FRAME_SCALE_DEFAULT = util.getintprop('ro.silk.camera.scale', 4);
const FRAME_SCALE_HIGH = util.getintprop('ro.silk.camera.scale.high', 2);

type FrameSize = {[key: CameraFrameSize]: SizeType};

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
const CAPTURE_CTL_SOCKET_NAME = '/dev/socket/silk_capture_ctl';
const CAPTURE_PCM_DATA_SOCKET_NAME = '/dev/socket/silk_capture_pcm';
const CAPTURE_MP4_DATA_SOCKET_NAME = '/dev/socket/silk_capture_mp4';


// Max amount of time to wait for the capture process to initialize up to the
// point that we can talk to it before trying anyway (and probably failing and
// restarting again)
const CAPTURE_MAX_RESTART_DELAY_MS = 10000;

// Amount of time to give the capture process to initialize before declaring
// the attempt as failed and triggering a retry
const CAPTURE_INIT_TIMEOUT_MS = 30 * 1000;

// If TAG_MP4 or TAG_PCM is not received in this amount of time assume the
// capture process is wedged and restart it.
const CAPTURE_TAG_TIMEOUT_MS = 1000 *
  (10 + CAMERA_VIDEO_ENABLED ? VIDEO_SEGMENT_DURATION_SECS * 1.5 : 0);

// If there is still not a camera frame after this number of attempts assume the
// capture process is wedged and restart it.
const CAPTURE_PREVIEW_GRAB_MAX_ATTEMPTS = 10 * (1000 / FRAME_DELAY_MS);

// These constants must match those in Channel.h
const HEADER_NR_BYTES = 20; // sizeof(Channel::Header)
const TAG_MP4 = 0;
const TAG_FACES = 1;
const TAG_PCM = 2;

const NUM_IMAGES_TO_CACHE = 10;

/**
 * Flash modes as defined in <camera/CameraParameters.cpp>
 * @memberof silk-camera
 * @property {(OFF|AUTO|ON|RED_EYE|TORCH)} FLASH_MODE flash modes
 */
let FLASH_MODE = {
  OFF: 'off',
  AUTO: 'auto',
  ON: 'on',
  RED_EYE: 'red-eye',
  TORCH: 'torch',
};

type FlashMode = typeof FLASH_MODE;

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
  let a = (offset) => i32a[faceIndex + offset];
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
function normalizeFace(face: RawHalFaceType, width: number, height: number): FaceType {
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
  return {
    x: normCoord(left, width),
    y: normCoord(top, height),
    width: normLen(right - left, width),
    height: normLen(bottom - top, height),
    leftEye: [
      normCoord(face.leftEye[0], width),
      normCoord(face.leftEye[1], height),
    ],
    rightEye: [
      normCoord(face.rightEye[0], width),
      normCoord(face.rightEye[1], height),
    ],
    id: face.id,
  };
}

/**
 * Module that talks to capture service to receive camera frames
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
 */
export default class Camera extends EventEmitter {

  _liveDiag: boolean = false;
  _audioMute: boolean = false;
  _frameCaptureEnabled: boolean = false;
  _fastFrameCaptureEnabled: boolean = false;
  _fastFrameCount: number = 0;
  _config: CameraConfig;
  _ready: boolean = false;
  _recording: boolean = false;
  _cvVideoCapture: ?VideoCapture = null;
  _cvVideoCaptureBusy: boolean = false;
  _ctlSocket: ?Socket = null;
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

  FRAME_SIZE: FrameSize;
  width: number;
  height: number;

  _cameraParameters: {[key: string]: string} = {};
  _pendingCameraParameters: null | {[key: string]: string} = {};

  constructor(config: $Shape<CameraConfig> = {}) {
    super();
    this._config = Object.assign({
      deviceMic: {
        bytesPerSample: 2,
        encoding: 'signed-integer',
        endian: 'little',
        numChannels: 1,
        sampleRate: 16000,
        sampleMin: -32768,
        sampleMax: 32767,
      },
    }, config);

    const resolution = util.getstrprop(
      'persist.silk.camera.resolution',
      util.getstrprop('ro.silk.camera.resolution', '1280x720')
    );
    this._cameraParameters['preview-size'] = resolution;
    this._setResolution(resolution);

    // Cache last few images to guarantee the consumers get the image they are
    // expecting and not the latest camera frame. Also helps prevent resizing a
    // frame multiple times.
    this._imagecache = new CBuffer(NUM_IMAGES_TO_CACHE);
    this._imagecache.overflow = (item) => this._releaseImageCacheEntry(item);

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

  get FLASH_MODE(): FlashMode {
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
   * @private
   */
  async _restart(why: string) {
    if (this._restartTimeout) {
      log.info(`camera restart pending (ignored "${String(why)}")`);
      return;
    }

    log.warn(`camera restart: ${why}`);

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
    this._throwyEmit('restart', why, true);
    this._ready = false;

    this._restartTimeout = setTimeout(() => {
      log.debug('restart timeout expired, trying to initialize anyway');
      this._restartTimeout = null;
      this._init();
    }, CAPTURE_MAX_RESTART_DELAY_MS);

    if (this._pendingCameraParameters === null) {
      this._pendingCameraParameters = {};
    }
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

    // A reasonable timeout for most things...
    const timeoutMs = 500;

    // Try to restart the camera pipeline in a reasonable manner:
    //   0. Stop video capture, allow any live capture to flush if possible
    //   1. Stop capture
    //   2. Stop camera server
    //   3. Start camera server
    //   4. Start capture
    //   5. Wait until the capture control socket is open
    //
    // Note that during this process _restartTimeout could trigger and charge
    // ahead anyway.  This prevents us from getting stuck here if there's some
    // kind of unforseen exception/error in the below async code.
    await Promise.race([
      this._closeCVVideoCapture(),
      util.timeout(timeoutMs),
    ]);

    if (process.platform !== 'android') {
      clearTimeout(this._restartTimeout);
      this._restartTimeout = null;
      this._init();
      return;
    }

    util.setprop('ctl.stop', 'silk-capture');
    await Promise.race([
      util.waitprop('init.svc.silk-capture', 'stopped'),
      util.timeout(timeoutMs),
    ]);

    util.setprop('ctl.stop', 'qcamerasvr');
    await Promise.race([
      util.waitprop('init.svc.qcamerasvr', 'stopped'),
      util.timeout(timeoutMs),
    ]);

    util.setprop('ctl.start', 'qcamerasvr');
    await Promise.race([
      util.waitprop('init.svc.qcamerasvr', 'running'),
      util.timeout(timeoutMs),
    ]);
    util.setprop('ctl.start', 'silk-capture');

    if (!this._restartTimeout) {
      log.warn('Danger: camera restart timeout beat async restart');
    }

    while (this._restartTimeout !== null) {
      // Wait a pinch for the capture process to finish starting before trying
      // to talk to it
      await util.timeout(timeoutMs);

      if (this._restartTimeout === null) {
        break;
      }

      try {
        log.debug('Connecting to', CAPTURE_CTL_SOCKET_NAME);
        await Promise.race([
          new Promise((resolve, reject) => {
            const socket = net.createConnection(CAPTURE_CTL_SOCKET_NAME, resolve);
            socket.once('error', reject);
          }),
          util.timeout(timeoutMs),
        ]);

        log.info('Capture process is running');
        if (this._restartTimeout !== null) {
          clearTimeout(this._restartTimeout);
          this._restartTimeout = null;
          this._init();
        }
      } catch (err) {
        log.info('Unable to connect to', CAPTURE_CTL_SOCKET_NAME, ':', err.message);
      }
    }
  }

  /**
   * Restarts the camera subsystem
   *
   * @memberof silk-camera
   * @instance
   */
  async restart() {
    this._restart('External restart request');
  }

  /**
   * @private
   */
  _initCVVideoCapture() {
    if (!this._cvVideoCapture) {
      this._cvVideoCaptureBusy = true;
      this._noFrameCount = 0;
      try {
        this._cvVideoCapture = new silkcapture.VideoCapture(
          CAMERA_ID,
          this.FRAME_SIZE.normal.width,
          this.FRAME_SIZE.normal.height,
          (err) => {
            if (err) {
              log.warn('Capture init failed:', err.message);
              throw err;
            }
            this._cvVideoCaptureBusy = false;
          }
        );
      } catch (err) {
        log.warn('Capture init failed:', err.message);
        throw err;
      }
    }
  }

  async _closeCVVideoCapture() {
    const cvVideoCapture = this._cvVideoCapture;
    if (cvVideoCapture) {
      this._cvVideoCapture = null;
      await new Promise((resolve) => cvVideoCapture.close(resolve));
    }
  }

  _initComplete() {
    clearTimeout(this._initTimeout);
    this._initTimeout = null;

    this._ready = true;

    // Send any new parameters queued during init
    const cameraParameters = this._pendingCameraParameters;
    if (cameraParameters !== null) {
      log.debug('Sending pending parameters', cameraParameters);
      this._pendingCameraParameters = null;
      for (let name in cameraParameters) {
        const value = cameraParameters[name];
        this.setParameter(name, value);
      }
    }

    /**
     * This event is emitted when camera has finished initialization
     *
     * @event ready
     * @memberof silk-camera
     * @instance
     */
    this._throwyEmit('ready');
  }

  _startMicCapture() {
    try {
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
        this._throwyEmit('mic-data', {when: Date.now(), frames: data});
      });
      micInput.on('error', (error) => {
        // TODO: what should we do on errors ...
        log.error(`Sim mic error: ${error}`);
      });
      simMic.start();
    } catch (err) {
      log.warn(`Unable to start mic capture: ${err.message}`);
    }
  }

  /**
   * Emit an event, and re-throw any exceptions to the process once the current
   * call stack is unwound.
   *
   * @private
   */
  // Legitimate use of 'any' here based on the fact that Flow's library
  // definition for EventEmitter uses it.
  // eslint-disable-next-line flowtype/no-weak-types
  _throwyEmit(eventName: string, ...args: Array<any>) {
    try {
      this.emit(eventName, ...args);
    } catch (err) {
      process.nextTick(() => {
        util.processthrow(err);
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
      this._restart('failed to initialize in a timely fashion');
    }, CAPTURE_INIT_TIMEOUT_MS);

    if (this._frameReplacer) {
      this._frameReplacer.reset();
    }

    if (process.platform !== 'android') {
      // The capture process is currently gonk only.  For other platforms only initialize
      // OpenCV video capture.
      process.nextTick(() => {
        if (AUDIO_HW_ENABLED) {
          this._startMicCapture();
        }
        this._initComplete();
        if (CAMERA_HW_ENABLED) {
          this._initCVVideoCapture();
          this._scheduleNextFrameCapture();
        }
      });
      return;
    }

    // Connect to data sockets
    if (AUDIO_HW_ENABLED) {
      invariant(this._micDataSocket === null);
      this._micDataSocket = this._connectDataSocket(CAPTURE_PCM_DATA_SOCKET_NAME);
    }
    if (CAMERA_VIDEO_ENABLED) {
      invariant(this._vidDataSocket === null);
      this._vidDataSocket = this._connectDataSocket(CAPTURE_MP4_DATA_SOCKET_NAME);
    }

    // Connect to control socket
    log.debug(`connecting to ${CAPTURE_CTL_SOCKET_NAME} socket`);
    this._ctlSocket = net.createConnection(CAPTURE_CTL_SOCKET_NAME, () => {
      log.debug(`connected to ${CAPTURE_CTL_SOCKET_NAME} socket`);

      if (CAMERA_HW_ENABLED) {
        this._initCVVideoCapture();
      }

      this._buffer = '';
      if (this._pendingCameraParameters !== null) {
        this._cameraParameters = Object.assign(
          this._cameraParameters,
          this._pendingCameraParameters
        );
      }
      this._pendingCameraParameters = {};
      const cmdData = {
        frames: CAMERA_HW_ENABLED,
        video: CAMERA_VIDEO_ENABLED,
        audio: AUDIO_HW_ENABLED,
        videoSegmentLength: VIDEO_SEGMENT_DURATION_SECS,
        cameraId: CAMERA_ID,
        width: this.width,
        height: this.height,
        fps: FPS,
        vbr: VBR,
        audioMute: this._audioMute,
        audioSampleRate: this._config.deviceMic.sampleRate,
        audioChannels: this._config.deviceMic.numChannels,
        cameraParameters: this._cameraParameters,
      };
      this._command({cmdName: 'init', cmdData});
    });
    const ctlSocket = this._ctlSocket;
    invariant(ctlSocket);

    ctlSocket.on('data', (data) => this._onCtlSocketRead(data));
    ctlSocket.on('error', (err) => {
      this._restart(`camera control socket error, reason=${err}`);
    });
    ctlSocket.on('close', (hadError) => {
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
      `mic=${String(this._micTagReceived)}`
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
        this._restart('Camera command errored out');
      } else if (captureEvent.eventName === 'initialized') {
        this._tagMonitorTimeout = setTimeout(this._tagMonitor, CAPTURE_TAG_TIMEOUT_MS);
        this._initComplete();

        if (CAMERA_HW_ENABLED) {
          this._scheduleNextFrameCapture();
        }
      } else if (captureEvent.eventName === 'getParameter') {
        if (this._getParameterCallback) {
          this._getParameterCallback.resolve(captureEvent.data);
          this._getParameterCallback = null;
        }
      } else if (captureEvent.eventName === 'stopped') {
        this._restart('stopped');
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

      let frames = formats.map((format) => { //eslint-disable-line no-loop-func
        switch (format) {
        case 'fullrgb':
          return image.fullrgb;
        case 'rgb':
          if (!image.rgb) {
            let rgb = image.fullrgb.copy();
            rgb.resize(this.FRAME_SIZE.normal.width, this.FRAME_SIZE.normal.height); // Slow!
            image.rgb = rgb;
          }
          return image.rgb;
        case 'fullgray':
          return image.fullgray;
        case 'highgray':
          if (!image.highgray) {
            let highgray = image.fullgray.copy();
            highgray.resize(this.FRAME_SIZE.high.width, this.FRAME_SIZE.high.height);
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
            lowgray.resize(this.FRAME_SIZE.low.width, this.FRAME_SIZE.low.height);
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

  _incNoFrameCount() {
    this._noFrameCount++;
    log.warn(`Waiting for camera frame: ` +
             `${this._noFrameCount}/${CAPTURE_PREVIEW_GRAB_MAX_ATTEMPTS}`);
    if (this._noFrameCount > CAPTURE_PREVIEW_GRAB_MAX_ATTEMPTS) {
      this._restart(`Camera frame timeout`);
    }
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
      log.info(`capture busy`);
      if (!fastFrameOnly) {
        this._incNoFrameCount();
      }
      return;
    }
    this._cvVideoCaptureBusy = true;
    let when = Date.now();

    let im = new cv.Matrix();
    if (fastFrameOnly) {
      cvVideoCapture.read(im, (err) => {
        if (err) {
          log.warn(`Unable to fetch fast frame: err=${err.message}`);
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
          this._incNoFrameCount();
        } else {
          this._noFrameCount = 0;
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
     * @property {Matrix} imRGB {@link https://github.com/peterbraden/node-opencv Opencv}
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
     * @property {Matrix} im {@link https://github.com/peterbraden/node-opencv Opencv}
     *                          matrix representing the image in raw YVU420SP format
     */
    this._throwyEmit('fast-frame', when, im);
  }

  /**
   * @private
   */
  _connectDataSocket(socketName: string): Socket {
    let _dataBuffer = null;
    log.debug(`connecting to ${socketName} socket`);
    const dataSocket = net.createConnection(socketName, () => {
      log.debug(`connected to ${socketName} socket`);
      _dataBuffer = null;
    });
    invariant(dataSocket);

    dataSocket.on('error', (err) => {
      this._restart(`camera data socket error, reason=${err}`);
    });
    dataSocket.on('close', (hadError) => {
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
        let now = tag === TAG_MP4 ? Date.now() : null;
        let sec = buf.readInt32LE(pos + 8);   // timeval.tv_sec
        let usec = buf.readInt32LE(pos + 12); // timeval.tv_usec
        let durationMs = buf.readInt32LE(pos + 16);
        let when = sec * 1000 + Math.round(usec / 1000); // UTC ms since epoch

        let pkt = buf.slice(pos + HEADER_NR_BYTES, pos + HEADER_NR_BYTES + size);

        let tagInfo = `| size:${size} when:${sec}.${usec} durationMs:${durationMs}`;
        switch (tag) {
        case TAG_MP4:
          {
            log.debug(`TAG_MP4 ${when}`, tagInfo);
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
               * This event is emitted when a MPEG4 video segment is available
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
            this.faces = rawFaceArrayToFaces(pkt).map(
              (face) => {
                return normalizeFace(
                  face,
                  this.FRAME_SIZE.normal.width,
                  this.FRAME_SIZE.normal.height
                );
              }
            );
          }
          break;
        case TAG_PCM:
          log.debug(`TAG_PCM ${when}`, tagInfo);
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
          this._throwyEmit('mic-data', {when: when, frames: pkt});
          break;
        default:
          // Flush the buffer and restart the socket
          _dataBuffer = null;
          this._restart('Invalid capture tag');
          throw new Error(`Invalid capture tag #${tag}, ${tagInfo}`);
        }
        pos += HEADER_NR_BYTES + size;
      }
      if (pos !== buf.length) {
        _dataBuffer = buf.slice(pos); // Save partial packet for next time
      } else {
        _dataBuffer = null;
      }
    });
    return dataSocket;
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
   * @return A promise that is resolved immediately (legacy)
   * @memberof silk-camera
   * @instance
   */
  async init(): Promise<void> {
    this._restart('initializing camera');
    return Promise.resolve();
  }

  /**
   * Block until the camera is online and operational.
   * <b>IMPORTANT:</b> Since the camera can crash at any time, once this method
   * returns it's never guaranteed that the camera is STILL online
   *
   * @return A promise that is resolved when camera is ready and operational
   * @memberof silk-camera
   * @instance
   */
  /* async */ ready(): Promise<void> {
    if (this._ready) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.once('ready', resolve);
    });
  }

  /**
   * Start camera recording
   *
   * @memberof silk-camera
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
   * @memberof silk-camera
   * @instance
   */
  stopRecording() {
    if (this._recording) {
      this._recording = false;
      log.verbose(`recording disabled (ready=${String(this._ready)})`);
    }
  }

  /**
   * @private
   */
  _setResolution(resolution: string): boolean {
    const parts = resolution.match(/^([1-9][0-9]+)x([1-9][0-9]+)$/);
    if (!parts) {
      throw new Error(`Invalid resolution: ${resolution}`);
    }
    invariant(parts[1] && parts[2]);
    const width = parseInt(parts[1], 10);
    const height = parseInt(parts[2], 10);

    if (width === this.width && height === this.height) {
      return false;
    }
    this.width = width;
    this.height = height;

    this.FRAME_SIZE = {
      low: {
        width: Math.round(this.width / FRAME_SCALE_LOW),
        height: Math.round(this.height / FRAME_SCALE_LOW),
      },
      normal: {
        width: Math.round(this.width / FRAME_SCALE_DEFAULT),
        height: Math.round(this.height / FRAME_SCALE_DEFAULT),
      },
      high: {
        width: Math.round(this.width / FRAME_SCALE_HIGH),
        height: Math.round(this.height / FRAME_SCALE_HIGH),
      },
      full: {
        width: this.width,
        height: this.height,
      },
    };

    log.verbose('Active frame sizes:');

    for (let frameSize in this.FRAME_SIZE) {
      // $FlowFixMe: frameSize IS compatible with the CameraFrameSize type...
      log.verbose(`  ${frameSize}: ${JSON.stringify(this.FRAME_SIZE[frameSize])}`);
    }
    return true;
  }

  async _stopCamera() {
    await this._closeCVVideoCapture();
    this._command({cmdName: 'stop'});
  }

  /**
   * Set a camera parameter.
   *
   * @param name
   * @param value
   * @memberof silk-camera
   * @instance
   */
  setParameter(name: string, value: string) {
    if (this._pendingCameraParameters !== null) {
      this._pendingCameraParameters[name] = value;
      log.info('setParameter pending', name, value);
      return;
    }

    if (this._cameraParameters[name] === value) {
      log.info('setParameter already current:', name, value);
      return;
    }

    log.info('setParameter now', name, value);
    this._cameraParameters[name] = value;
    if (name === 'preview-size') {
      if (this._setResolution(value)) {
        util.setprop('persist.silk.camera.resolution', value);

        // TODO: One day support resolution change without a restart
        log.info('setParameter stopping camera');
        this._stopCamera();
        return;
      }
    }
    this._command({cmdName: 'setParameter', name, value});
  }

  /**
   * Set flash mode as specified by flashMode parameter
   *
   * @param flashMode flash-mode parameter to set in camera
   * @memberof silk-camera
   * @instance
   */
  flash(flashMode: string) {
    if (!FLASH_LIGHT_ENABLED) {
      log.warn(`flash light is not enabled`);
      return;
    }
    this.setParameter('flash-mode', flashMode);
  }

  /**
   * Set mute mode
   *
   * @param mute Mute mic true or false
   * @memberof silk-camera
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
   * @memberof silk-camera
   * @instance
   */
  async getParameterInt(name: string): Promise<number> {
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
      this._getParameterCallback = {resolve, reject};
    });
    return await getParamPromise;
  }

  /**
   * Get string camera parameter. This function returns a Promise that resolves
   * when the parameter value is successfully retrieved
   *
   * @param name of camera parameter to get
   * @memberof silk-camera
   * @instance
   */
  async getParameterStr(name: string): Promise<string> {
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
      this._getParameterCallback = {resolve, reject};
    });
    return await getParamPromise;
  }

  /**
   * Returns the current camera video size.
   *
   * @memberof silk-camera
   * @instance
   */
  get videoSize(): SizeType {
    return {width: this.width, height: this.height};
  }

  /**
   * Returns the current camera frame size.
   *
   * @param frameSize Frame size of interest ('normal' if null)
   * @memberof silk-camera
   * @instance
   */
  getFrameSize(frameSize?: CameraFrameSize): SizeType {
    frameSize = frameSize || 'normal';
    if (typeof this.FRAME_SIZE[frameSize] !== 'object') {
      throw new Error(`Invalid frameSize: ${frameSize}`);
    }
    return this.FRAME_SIZE[frameSize];
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
   * @memberof silk-camera
   * @instance
   */
  normalRectsTo(rects: Array<Rect>, frameSize: CameraFrameSize): Array<Rect> {
    const scale = this.getFrameSize(frameSize).width / this.FRAME_SIZE.normal.width;
    return rects.map((rect) => Camera._scaleRect(rect, scale));
  }

  /**
   * Scales rectangles of the specified CameraFrameSize to the normal size
   *
   * @param rects Array of rectangles to normalize
   * @param frameSize Desired scale
   * @return Array of normalized rectangles
   * @memberof silk-camera
   * @instance
   */
  normalRectsFrom(rects: Array<Rect>, frameSize: CameraFrameSize): Array<Rect> {
    const scale = this.FRAME_SIZE.normal.width / this.getFrameSize(frameSize).width;
    return rects.map((rect) => Camera._scaleRect(rect, scale));
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
   * @memberof silk-camera
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
   * @memberof silk-camera
   * @instance
   */
  getNextFrame(
    format: ImageFormat,
    width: number,
    height: number,
  ): Promise<?Matrix> {
    return new Promise((resolve, reject) => {
      this._captureFrameCustom(format, width, height, (err, frame) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(frame);
      });
    });
  }
}
