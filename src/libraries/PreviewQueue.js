/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

//
// PreviewQueue attempts to smooth out the preview frames received over the
// network.
//
// Preview frames should be provided to PreviewQueue.push() as quickly as they
// arrive, and the onDisplay() callback will be invoked if/when the time is
// right to display the frame to the user.
//


import mklog from '../log'; const log = mklog('PreviewQueue');

// How long to delay the live preview image to allow for new frames to arrive
// before they must be displayed to the user. This can help give a smoother
// preview experience as it masks minor network delays, at the expense of real
// time preview delay.
//
// TODO: This value may need to be dynamically adjusted based on region and
//       current network conditions.
const PREVIEW_LAG_MS = 500;

export default class PreviewQueue {
  constructor(name, onDisplay) {
    this._name = name;
    this._onDisplay = onDisplay;

    // The device time of the preview image that is currently being displayed to the user
    // (sometime <= this._deviceTime)
    this._lastDevicePreviewTime = null;

    // The current device time that the app is attempting to best represent in
    // the preview.  This is usually in the past around -PREVIEW_LAG_MS
    this._deviceTime = null;

    this._previewTimeoutId = null;
    this._previewQueue = [];
  }

  deinit() {
    if (this._previewTimeoutId) {
      clearTimeout(this._previewTimeoutId);
      this._previewTimeoutId = null;
    }
  }

  push(msg) {
    let previewArrival = { now: Date.now(), when: msg.when };
    if (this._lastPreviewArrival) {
      let queueTimeRange = '';
      if (this._previewQueue.length > 0) {
        queueTimeRange = ', queueRange=' +
          (previewArrival.when - this._previewQueue[0].when) + 'ms';
      }

      log.verbose(`preview ${this._name}:` +
       ' queueDepth=' + this._previewQueue.length +
       ', device elapsed=' + // Elapsed time on device since last preview
          (previewArrival.when - this._lastPreviewArrival.when) + 'ms' +
        ', app elapsed=' + // Elapsed time on app since last preview
          (previewArrival.now - this._lastPreviewArrival.now) + 'ms' +
        ', device2app lag=' + // How far behind the app is from this preview image
          (previewArrival.when - this._deviceTime) +
        queueTimeRange // How far apart the first/last items in the queue are
      );
      previewArrival.when - this._lastPreviewArrival.when;


    }
    this._lastPreviewArrival = previewArrival;

    this._previewQueue.push(msg);
    if (this._previewTimeoutId === null) {
      this._advancePreviewImage();
    }
  }

  _setNextPreviewFrameTimeout() {
    let diff = this._previewQueue[0].when - this._deviceTime;
    log.debug(`Time to next frame: ${diff}ms`);
    this._previewTimeoutId = setTimeout(this._advancePreviewImage, diff);
  }

  _advancePreviewImage = () => {
    if (this._previewQueue.length === 0) {
      log.error('Empty previewQueue');
      return;
    }

    if (this._previewTimeoutId) {
      clearTimeout(this._previewTimeoutId);
      this._previewTimeoutId = null;
    }

    if (this._lastDevicePreviewTime !== null) {
      // The preview frames are guaranteed to arrive in chronological order
      // over socket.io.  However the device time could change at any time, at
      // which point the relative time between frames becomes meaningless.
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
    if (this._deviceTime === null) {
      // First frame.  Set device time reference to -PREVIEW_LAG_MS
      this._deviceTime = this._previewQueue[0].when - PREVIEW_LAG_MS;
    } else {
      // Advance device time by the time elapsed since this method last executed
      this._deviceTime += now - this._lastNow;
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
          this._previewQueue[0].when < this._deviceTime) {
      preview = this._previewQueue.shift();
      skip += 1;
    }
    if (skip > 0) {
      let skipMs = preview.when - this._lastDevicePreviewTime;
      log.error(`Skipped ahead ${skipMs}ms, ${skip} frame(s)`);
    }

    // If the following preview frame is already received set a timer for it
    if (this._previewQueue.length > 0) {
      this._setNextPreviewFrameTimeout();
    }

    this._lastDevicePreviewTime = preview.when;
    this._onDisplay(preview);
  }
}

