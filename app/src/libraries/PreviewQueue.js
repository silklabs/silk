/**
 * PreviewQueue attempts to smooth out the preview frames received over the
 * network.
 *
 * Preview frames should be provided to PreviewQueue.push() as quickly as they
 * arrive, and the onDisplay() callback will be invoked if/when the time is
 * right to display the frame to the user.
 *
 * @flow
 */

import createLog from 'silk-log';

const log = createLog('PreviewQueue');

// How long to delay the live preview image to allow for new frames to arrive
// before they must be displayed to the user. This can help give a smoother
// preview experience as it masks minor network delays, at the expense of real
// time preview delay.
//
// TODO: This value may need to be dynamically adjusted based on region and
//       current network conditions.
const PREVIEW_LAG_MS = 500;

// This should probably live in device timeline.js as well.
type DeviceVideoMessage = {
  frame: any;
  contents: 'jpeg' | 'mp4';
  when: number;
  durationMs: number;
  deviceEmitMs: number;
};

type DisplayCallback = (message: DeviceVideoMessage) => void;

export default class PreviewQueue {
  _name: string;
  _onDisplay: DisplayCallback;

  // The device time of the preview image that is currently being displayed to the user
  // (sometime <= this._deviceTime)
  _lastDevicePreviewTime: ?number = null;
  _lastPreviewArrival: {
    now: number;
    when: number;
  };
  _lastNow: ?number = null;

  // The current device time that the app is attempting to best represent in
  // the preview.  This is usually in the past around -PREVIEW_LAG_MS
  _deviceTime: ?number = null;

  _previewTimeoutId: ?number = null;
  _previewQueue: Array<DeviceVideoMessage> = [];

  constructor(name: string, onDisplay: DisplayCallback) {
    this._name = name;
    this._onDisplay = onDisplay;
  }

  deinit() {
    if (this._previewTimeoutId) {
      clearTimeout(this._previewTimeoutId);
      this._previewTimeoutId = null;
    }
  }

  push(msg: DeviceVideoMessage) {
    if (__DEV__) {
      let previewArrival = { now: Date.now(), when: msg.when };
      if (this._lastPreviewArrival) {
        // Elapsed time on device since last preview
        let deviceElapsed = previewArrival.when - this._lastPreviewArrival.when;
        // Elapsed time on app since last preview
        let appElapsed = previewArrival.now - this._lastPreviewArrival.now;
        // How far behind the app is from this preview image
        let deviceToAppLag = previewArrival.when - (this._deviceTime || 0);
        // How far apart the first/last items in the queue are
        let queueTimeRange = null;
        if (this._previewQueue.length) {
          queueTimeRange = previewArrival.when - this._previewQueue[0].when;
        }

        log.debug(`preview ${this._name}: ` +
                  `queueDepth=${this._previewQueue.length} ` +
                  `device elapsed=${deviceElapsed} ms ` +
                  `app elapsed=${appElapsed} ms ` +
                  `device to app lag=${deviceToAppLag} ms ` +
                  `queueRange=${String(queueTimeRange)} ms`);
      }
      this._lastPreviewArrival = previewArrival;
    }

    this._previewQueue.push(msg);
    if (this._previewTimeoutId === null) {
      this._advancePreviewImage();
    }
  }

  _setNextPreviewFrameTimeout() {
    let diff = this._previewQueue[0].when - (this._deviceTime || 0);
    log.debug(`Time to next frame: ${diff}ms`);
    this._previewTimeoutId = setTimeout(this._advancePreviewImage, diff);
  }

  _advancePreviewImage: (() => void) = () => {
    if (this._previewQueue.length === 0) {
      log.error('Empty previewQueue');
      return;
    }

    if (this._previewTimeoutId) {
      clearTimeout(this._previewTimeoutId);
      this._previewTimeoutId = null;
    }

    if (typeof this._lastDevicePreviewTime === 'number') {
      // The preview frames are guaranteed to arrive in chronological order
      // over the channel.  However the device time could change at any time,
      // at which point the relative time between frames becomes meaningless.
      let latestPreview = this._previewQueue[this._previewQueue.length - 1];
      let deviceTimeDiff = latestPreview.when - this._lastDevicePreviewTime;

      if (deviceTimeDiff < 0 ||                   // Device time rolled back
          deviceTimeDiff > 10 * PREVIEW_LAG_MS) { // Device time advanced or major network delay
        log.warn(`Preview warp on ${this._name}! diff=${deviceTimeDiff}ms`);
        this._deviceTime = null; // Recompute the device time below
        this._lastDevicePreviewTime = null;
        this._previewQueue = [latestPreview];
      }
    }

    const now = Date.now();
    if (typeof this._deviceTime !== 'number') {
      // First frame.  Set device time reference to -PREVIEW_LAG_MS
      this._deviceTime = this._previewQueue[0].when - PREVIEW_LAG_MS;
    } else {
      // Advance device time by the time elapsed since this method last executed
      this._deviceTime += now - (this._lastNow || 0);
    }
    this._lastNow = now;

    // Not time to display the first frame yet?
    if (this._deviceTime < this._previewQueue[0].when) {
      this._setNextPreviewFrameTimeout();
      return;
    }

    // Select closest frame to the current device time (this._deviceTime).
    //
    // In adverse network conditions frames can arrive in waves,
    // skip over the older frames if a newer one is available.
    let skip = 0;
    let preview = this._previewQueue.shift();
    while (this._previewQueue.length > 0 &&
           this._previewQueue[0].when < (this._deviceTime || 0)) {
      preview = this._previewQueue.shift();
      skip += 1;
    }
    if (skip > 0) {
      let skipMs = preview.when - (this._lastDevicePreviewTime || 0);
      log.error(`Skipped ahead ${skipMs}ms, ${skip} frame(s)`);
    }

    // If the following preview frame is already received set a timer for it
    if (this._previewQueue.length > 0) {
      this._setNextPreviewFrameTimeout();
    }

    this._lastDevicePreviewTime = preview.when;
    this._onDisplay(preview);
  };
}
