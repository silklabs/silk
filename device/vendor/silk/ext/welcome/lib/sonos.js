/**
 * Copyright (c) 2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

import SonosApi from 'sonos';

let log;

export default class Sonos {
  constructor(env) {
    this._env = env;
    log = env.log;

    log.info('initializing Sonos');
    this.startSearch();
  }

  startSearch() {
    log.info('searching for Sonos...');
    this._sonosSearch = SonosApi.search();
    this._sonosSearch.on('DeviceAvailable', this._onSonosFound);
  }

  stopSearch() {
    this._sonosSearch.removeListener('DeviceAvailable', this._onSonosFound);
    this._sonosSearch.destroy();
    this._sonosSearch = undefined;
  }

  _onSonosFound = (device /*, model */) => {
    log.info(`Sonos found: ${device.host}:${device.port}`);
    this._sonos = new SonosApi.Sonos(device.host, device.port);
  };

  pause() {
    if (!this._sonos) {
      return;
    }

    this._sonos.pause((err, paused) => {
      log.info(`Sonos now ${paused ? 'paused' : 'not paused'}` +
          `${err ? 'err: ' + err : ''}`);
    });
  }

  play() {
    if (!this._sonos) {
      return;
    }

    this._sonos.play((err, playing) => {
      log.info(`Sonos now ${playing ? 'playing' : 'not playing'}` +
          `${err ? 'err: ' + err : ''}`);
    });
  }

  playQuery(query, value) {
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

    if (!this._sonos) {
      return;
    }

    this._sonos.getMusicLibrary(query, {start: 0}, (err, result) => {
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

  playUri(uri) {
    if (!this._sonos) {
      return;
    }

    log.info(`Queueing Sonos for ${uri}`);

    this._sonos.queueNext(uri, (err, queued) => {
      if (!err) {
        this.play();
      } else {
        log.error(`Sonos query failed: ${err}`);
      }
    });
  }

  willUnload() {
    this.stopSearch();
  }
}
