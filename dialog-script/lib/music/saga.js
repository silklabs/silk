/**
 * @flow
 */

import createLog from 'silk-log';
import {call} from 'redux-saga/effects';
import invariant from 'assert';
import sonos from 'silk-sonos';

import type {Environment} from '../environment';
import type {Track} from 'sonos';

const log = createLog(`script-generic-music-saga`);

export function* playMusic(
  environment: Environment,
): Generator<Object, void, any> {
  invariant(environment);

  const {speak} = environment;
  invariant(speak);

  log.info(`Starting play music saga`);
  sonos.play();

  yield call(speak, 'Playing', `idle`);
}

export function* pauseMusic(
  environment: Environment,
): Generator<Object, void, any> {
  invariant(environment);

  const {speak} = environment;
  invariant(speak);

  log.info(`Starting play music saga`);
  sonos.pause();

  yield call(speak, 'Pausing', `idle`);
}

export function* getCurrentSong(
  environment: Environment,
): Generator<Object, void, any> {
  invariant(environment);

  const {speak} = environment;
  invariant(speak);

  try {
    let track: Track = yield call(() => sonos.getTrackInfo());

    if (track.title) {
      let artistString = (track.artist) ? ` by ${track.artist}` : '';
      yield call(speak, `The current song is ${track.title}${artistString}`,
          `idle`);
    } else if (track.artist) {
      yield call(speak, `The current artist is ${track.artist}`, `idle`);
    } else {
      yield call(speak, 'Sorry, no song information is available', `idle`);
    }
  } catch (error) {
    log.error(`unexpected error while getting current track info: ${error}`);
    yield call(speak, 'Sorry, unable to get song information', `idle`);
  }
}

export function* getArtist(
  environment: Environment,
): Generator<Object, void, any> {
  yield call(getCurrentSong);
}

