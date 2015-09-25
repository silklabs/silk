/**
 * Copyright (c) 2015 Silk Laboratories, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Laboratories, Inc.
 *
 * @flow
 */

import api from './api';
import * as util from './util';
import { EventEmitter } from 'events';
import createLog from './log';
let log = createLog('events');

type TimelineEvent = {
  tag: string;
  when: number;
  [arbitraryKeys: string]: any;
};

type LocalEventRecord = {
  serverId?: string;
  tag: string;
  startUTC: number;
  endUTC: number;
  data: {[arbitraryKeys: string]: any};
};

// Incomplete. We should really create an interface file for socket.io-client.
// See also https://github.com/silklabs/silk-device/issues/758.
type SocketIOSocket = {
  connected: boolean;
};

const DEFAULT_DEBOUNCE_MS = 5000;
const DEBOUNCE_MS_BY_EVENT_TAG = {
  motion: 10000,
};

const RECURRING_TIMER_INTERVAL_MS = 1000;
const DEFAULT_EVENT_LENGTH_MS = 1000;

const ENABLED_PROP = 'persist.silk.eventtrk.enabled';
const ENABLED = util.getboolprop(ENABLED_PROP);
log.info(`Upload enabled: ${ENABLED}`);

/**
 * Record event bursts from the camera and microphone and assemble
 * potentially long-living events from them. For instance, prolonged
 * motion detection over multiple 1s periods will be tracked as a
 * single motion event lasting several seconds.
 */
class EventTracker extends EventEmitter {
  deviceId: string;
  _serverSocket: ?SocketIOSocket;
  _eventRecords: {[key: string]: LocalEventRecord};
  _queue: Array<LocalEventRecord>;
  _expirationTimer: ?number;
  running: boolean;

  constructor(deviceId: string) {
    super();
    this.deviceId = deviceId;
    this._eventRecords = {};
    this.running = false;
    this._queue = [];
  }

  eventDiscriminator(event: TimelineEvent): string {
    // For now we throw all 'motion', 'car', etc. events into one basket.
    // Later one we could use additional info to discriminate one 'face'
    // event from another 'face' event.
    // TODO: We also need to consider deduping generic 'motion' events
    // when the motion is due to 'car', 'face', etc. events. In that
    // case the more specific event is the more interesting one.
    return event.tag;
  }

  record(event: TimelineEvent) {
    let discriminator = this.eventDiscriminator(event);
    let record = this._eventRecords[discriminator];
    if (record) {
      record.endUTC = event.when;
      // No need to do anything else here. Our periodic timer will
      // enqueue this event once it has expired, so that the end time
      // will be updated on the server.
      log.info(`Extended event '${record.tag}'. Total duration: ${record.endUTC - record.startUTC}ms`);
    } else {
      record = this._eventRecords[discriminator] = {
        tag: event.tag,
        startUTC: event.when,
        endUTC: event.when + DEFAULT_EVENT_LENGTH_MS,
        // TODO: we might be able to pile more stuff into the `data` field later on, such as
        // which face was detected, movement of the motion across the screen, etc.
        data: {tag: event.tag},
      };
      log.info(`Recorded event '${record.tag}'`);

      // Push this in the upload queue so that we create a server
      // record of the event.
      this._enqueue(record);
      // Ensure we're tracking expirations.
      this._trackExpirations();
    }
  }

  _enqueue(record: LocalEventRecord) {
    if (this._queue.indexOf(record) !== -1) {
      log.info(`Event '${record.tag}' already in queue`);
      return;
    }
    this._queue.push(record);
    this.start();
  }

  _processQueue() {
    if (!this._serverSocket || !this._serverSocket.connected) {
      log.warn(`server socket not ready, not uploading`);
      this.stop();
      return;
    }

    if (!this._queue.length) {
      log.info(`Upload queue is empty, stopping.`);
      this.stop();
      return;
    }

    log.info(`Processing upload queue, size ${this._queue.length}`);
    let record = this._queue.shift();
    let promise;
    if (record.serverId) {
      promise = api.timeMeta.update(record.serverId, {
        endUTC: record.endUTC,
        data: record.data,
      }).then(() => {
        log.info(`Updated event '${record.tag}', id '${record.serverId}' on the server`);
      });
    } else {
      // This event hasn't been uploaded to the server yet at all.
      promise = api.timeMeta.create({
        metaType: 'event',
        deviceId: this.deviceId,
        startUTC: record.startUTC,
        endUTC: record.endUTC,
        data: record.data,
      }).then((result) => {
        record.serverId = result.id;
        log.info(`Uploaded event '${record.tag}', id '${record.serverId}' to the server`);
      });
    }
    promise
      .catch((error) => log.error(`Failed upload record: ${error}`))
      .then(() => process.nextTick(() => this._processQueue()));
  }

  _trackExpirations() {
    if (this._expirationTimer) {
      return;
    }
    this._expirationTimer = setTimeout(() => {
      delete this._expirationTimer;
      this._expire();
    }, RECURRING_TIMER_INTERVAL_MS);
  }

  _expire() {
    for (let discriminator in this._eventRecords) {
      let record = this._eventRecords[discriminator];
      let debounce = DEBOUNCE_MS_BY_EVENT_TAG[record.tag] || DEFAULT_DEBOUNCE_MS;
      if (record.endUTC + debounce > Date.now()) {
        // Nothing to do, yet.
        // TODO: we might want to consider updating the server record
        // periodically even if the event hasn't fully expired yet.
        continue;
      }
      // We now declare the event over.
      log.info(`Event '${record.tag}' is now over. Total duration: ${record.endUTC - record.startUTC}ms`);
      delete this._eventRecords[discriminator];
      this._enqueue(record);
    }
    let eventsLeftToTrack = Object.keys(this._eventRecords).length;
    if (eventsLeftToTrack) {
      log.info(`Still tracking ${eventsLeftToTrack} events. Back in ${RECURRING_TIMER_INTERVAL_MS}ms.`);
      this._trackExpirations();
    } else {
      log.info(`No more events to track, sleeping.`);
    }
  }

  /**
   * Start working the queue (it is safe to call this multiple times)
   */
  start() {
    // Already working...
    if (this.running || !ENABLED) {
      return;
    }
    this.running = true;
    this.emit('starting');
    log.info(`Starting upload queue processing.`);
    this._processQueue();
  }

  /**
   * Stop working the queue (will not abort any running work)
   */
  stop() {
    if (!this.running) {
      return;
    }
    log.info(`Stopping upload queue processing.`);
    this.running = false;
    this.emit('stopping');
  }

  /**
   * Update this's handle to the master server socket
   */
  set socket(socket) {
    this._serverSocket = socket;
    this.start();
  }
}

module.exports = (deviceId: string): EventTracker => new EventTracker(deviceId);
