/**
 * Copyright (c) 2015 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @flow
 */

import crypto from 'crypto';

import { EventEmitter } from 'events';
import * as util from './sysutils';
import APICallOperation from './outbox/api_call_operation';
import createLog from './log';
const log = createLog('events');

import type { TimelineEventObject } from './timeline';
import type { Outbox } from './outbox/manager';

type LocalEventRecord = {
  id: ?string;
  serverId?: string;
  tag: string;
  startUTC: number;
  endUTC: number;
  data: {[arbitraryKeys: string]: any};
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

// If 12 bytes is enough for MongoDB, it should be enough for us.
// See https://docs.mongodb.org/manual/reference/object-id/
const ID_NUM_BYTES = 12;
// Any string that's not 12 bytes == 16 base64 characters long.
const GENERATING_ID_PLACEHOLDER = 'generating';

function generateRecordID(): Promise<string> {
  return new Promise((resolve, reject) => {
    crypto.randomBytes(ID_NUM_BYTES, (error, idBytes) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(idBytes.toString('base64'));
    });
  });
}

/**
 * Record event bursts from the camera and microphone and assemble
 * potentially long-living events from them. For instance, prolonged
 * motion detection over multiple 1s periods will be tracked as a
 * single motion event lasting several seconds.
 */
export default class EventTracker extends EventEmitter {
  deviceId: string;
  outbox: Outbox;
  _eventRecords: {[key: string]: LocalEventRecord};
  _expirationTimer: ?number;

  constructor(deviceId: string, outbox: Outbox) {
    super();
    this.deviceId = deviceId;
    this.outbox = outbox;
    this._eventRecords = {};
  }

  _eventDiscriminator(event: TimelineEventObject): string {
    // For now we throw all 'motion', 'car', etc. events into one basket.
    // Later one we could use additional info to discriminate one 'face'
    // event from another 'face' event.
    // TODO: We also need to consider deduping generic 'motion' events
    // when the motion is due to 'car', 'face', etc. events. In that
    // case the more specific event is the more interesting one.
    return event.tag;
  }

  record(event: TimelineEventObject) {
    let discriminator = this._eventDiscriminator(event);
    let record = this._eventRecords[discriminator];
    if (record) {
      record.endUTC = event.when;
      if (record.endUTC < record.startUTC) {
        record.startUTC = record.endUTC; // System time moved backwards?
      }

      // No need to do anything else here. Our periodic timer will
      // enqueue this event once it has expired, so that the end time
      // will be updated on the server.
      log.info(`Extended event '${record.tag}'. Total duration: ${record.endUTC - record.startUTC}ms`);
      return;
    }

    // Insert the record into our local store right away. But we can't
    // upload it to the server until we've generated a random ID for it.
    // Generating the ID on the client is important so that subsequent
    // updates to the same event are not recorded as separate records on
    // the server.
    record = this._eventRecords[discriminator] = {
      id: null,
      tag: event.tag,
      startUTC: event.when,
      endUTC: event.when + DEFAULT_EVENT_LENGTH_MS,
      // TODO: we might be able to pile more stuff into the `data`
      // field later on, such as which face was detected, direction of
      // the motion across the screen, etc.
      data: {tag: event.tag},
    };
    log.info(`Recorded event '${record.tag}'`);

    // Push this in the upload queue so that we create a server
    // record of the event.
    this._enqueue(record);
    // Ensure we're tracking expirations.
    this._trackExpirations();
  }

  async _enqueue(record: LocalEventRecord): Promise<void> {
    if (record.id === GENERATING_ID_PLACEHOLDER) {
      // The record is already enqueued, we're just generating an ID for it.
      // No need to enqueue it again.
      return;
    }
    if (!record.id) {
      record.id = GENERATING_ID_PLACEHOLDER;
      record.id = await generateRecordID();
    }
    let operation = new APICallOperation({
      endpoint: 'metadataPublisher.create',
      args: [{
        metaType: 'event',
        id: record.id,
        startUTC: record.startUTC,
        endUTC: record.endUTC,
        data: record.data,
      }]
    });

    this.outbox.addToQueue(operation, null);
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
}
