/**
 * Copyright (c) 2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @flow
 */

import invariant from 'assert';
import {Sonos, search} from 'sonos';
import createLog from 'silk-log/device';

import type {Search, Track} from 'sonos';

const log = createLog('sonos');

export class SilkSonos {
  _sonos: ?Sonos = null;
  _sonosSearch: ?Search = null;

  constructor() {
    log.info('initializing Sonos');
    this.startSearch();
  }

  startSearch() {
    log.info('searching for Sonos...');
    this._sonosSearch = search();
    this._sonosSearch.on('DeviceAvailable', this._onSonosFound);
  }

  stopSearch() {
    const sonosSearch = this._sonosSearch;
    invariant(sonosSearch);
    sonosSearch.removeListener('DeviceAvailable', this._onSonosFound);
    sonosSearch.destroy();
    this._sonosSearch = null;
  }

  _onSonosFound = (device: Sonos) => {
    log.info(`Sonos found: ${device.host}:${device.port}`);
    this._sonos = device;
  };

  pause() {
    const sonos = this._sonos;
    if (!sonos) {
      return;
    }

    sonos.pause((err, paused) => {
      log.info(`Sonos now ${paused ? 'paused' : 'not paused'}` +
          `${err ? 'err: ' + err : ''}`);
    });
  }

  play() {
    const sonos = this._sonos;
    if (!sonos) {
      return;
    }

    sonos.play((err, playing) => {
      log.info(`Sonos now ${playing ? 'playing' : 'not playing'}` +
          `${err ? 'err: ' + err : ''}`);
    });
  }

  playQuery(query: string, value: string) {
    const validQueries = [
      'artists',
      'albumArtists',
      'albums',
      'genres',
      'composers',
      'tracks',
      'playlists',
      'share',
    ];

    if (!validQueries.some(q => q === query)) {
      log.error(`Bad Sonos query ${query}, ${value}`);
      return;
    }

    const sonos = this._sonos;
    if (!sonos) {
      return;
    }

    sonos.getMusicLibrary(query, {start: 0}, (err, result) => {
      let uri;
      if (!err) {
        result.items.forEach(item => {
          if (value === item.title) {
            uri = item.uri;
          }
        });
      }
      if (uri) {
        this.playUri(uri);
      } else {
        log.error(`Sonos query not found: ${query}, ${value}`);
      }
    });
  }

  playUri(uri: string) {
    const sonos = this._sonos;
    if (!sonos) {
      return;
    }

    log.info(`Queueing Sonos for ${uri}`);

    sonos.queueNext(uri, (err, queued) => {
      if (!err) {
        this.play();
      } else {
        log.error(`Sonos query failed: ${err}`);
      }
    });
  }

  getTrackInfo(): Promise<Track> {
    const sonos = this._sonos;
    if (!sonos) {
      return Promise.reject();
    }

    log.info(`Getting track info`);
    return new Promise((resolve, reject) => {
      sonos.currentTrack((err, track) => {
        if (err) {
          reject(new Error(`Sonos get track info: ${err}`));
        } else {
          resolve(track);
        }
      });
    });
  }
}

export default new SilkSonos();
