/**
 * @flow
 */

import createLog from 'silk-log/device';
import {call} from 'redux-saga/effects';
import invariant from 'assert';
import sonos from 'silk-sonos';
import player from 'silk-audioplayer';
import fs from 'mz/fs';
import path from 'path';

import type {Environment} from '../environment';
import type {Track} from 'sonos';

const log = createLog(`script-generic-music-saga`);
type MediaState = 'playing' | 'stopped';

const DIR = '/data/media/music';
let songs = null;
let mediaState: MediaState = 'stopped';

function readMusicDir(dir: string): Promise<Array<string>> {
  if (!songs) {
    return fs.readdir(dir)
    .then(files => {
      songs = files.filter(filename => ['.wav', '.mp3'].includes(filename.substr(-4)));
      songs = songs.map(song => path.join(DIR, song));
      return songs;
    })
    .catch(err => {
      log.warn(`Failed to read music dir`, err);
      return [];
    });
  } else {
    return Promise.resolve(songs);
  }
}

/**
 * Play next song after the previous one is finished
 *
 * @param songs
 * @returns a promise that is resolved when all songs are done playing
 */
function playNextSong(environment: Environment, songs: Array<string>): Promise<void> {
  const {dialogEngine} = environment;

  let playNext = song => {
    return dialogEngine.dialogDone().then(() => {
      if (mediaState === 'playing') {
        log.debug(`Starting to play song ${song}`);
        return player.play(song);
      } else {
        log.warn(`Ignoring play request as an explicit stop is requested`);
        return Promise.resolve();
      }
    });
  };

  let playPromise = Promise.resolve();
  for (let i = 0; i < songs.length; i++) {
    playPromise = playPromise.then(() => playNext(songs[i]));
  }
  return playPromise;
}

/**
 * Play all the songs in a loop
 */
function playAllSongs(environment: Environment, songs: Array<string>) {
  const {speak} = environment;

  playNextSong(environment, songs)
  .then(() => {
    if (mediaState === 'playing') {
      log.debug(`Finished playing all songs. Repeating`);
      process.nextTick(() => playAllSongs(environment, songs));
    }
  })
  .catch(err => {
    log.error(`Error playing songs `, err);
    speak('Sorry, I am unable to play music', `idle`);
    return;
  });
}

export function* playSonos(
  environment: Environment,
): Generator<Object, void, any> {
  invariant(environment);

  const {speak} = environment;
  invariant(speak);

  sonos.play();

  yield call(speak, 'Playing Sonos', `idle`);
}

export function* pauseSonos(
  environment: Environment,
): Generator<Object, void, any> {
  invariant(environment);

  const {speak} = environment;
  invariant(speak);

  sonos.pause();

  yield call(speak, 'Pausing Sonos', `idle`);
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

export function* playMusic(
    environment: Environment,
): Generator<Object, void, any> {
  invariant(environment);

  const {speak} = environment;
  invariant(speak);

  if (mediaState === 'playing') {
    yield call(speak, 'Songs are already playing', `idle`);
    return;
  }

  // Read list of songs from music directory
  let songs = yield call(readMusicDir, DIR);
  if (!songs || !songs.length) {
    yield call(speak, 'Sorry, there are no songs available to play on the device');
    yield call(speak, 'You can say play sonos to play song on sonos instead', `idle`);
    return;
  }

  mediaState = 'playing';
  playAllSongs(environment, songs);

  yield call(speak, 'Playing music', `idle`);
}

export function* pauseMusic(
    environment: Environment,
): Generator<Object, void, any> {
  invariant(environment);

  const {speak} = environment;
  invariant(speak);

  mediaState = 'stopped';

  log.debug(`Pausing the music`);
  player.stop();
  yield call(speak, 'Pausing music', `idle`);
}
