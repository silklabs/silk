/**
 * @flow
 */

import createLog from 'silk-log/device';
import {call} from 'redux-saga/effects';
import invariant from 'assert';
import sonos from 'silk-sonos';
import Player from 'silk-audioplayer';
import fs from 'mz/fs';
import path from 'path';
import Speaker from 'silk-speaker';
import icy from 'icy';
import lame from 'lame';

import type {Environment} from '../environment';
import type {Track} from 'sonos';

const log = createLog(`script-generic-music-saga`);
type MediaState = 'playing' | 'stopped';

const DIR = '/data/media/music';
const SHOUTCAST_URL = 'http://kidspublicradio2.got.net:8000/lullaby?lang=en-US%2cen%3bq%3d0.8';

let songs = null;
let mediaState: MediaState = 'stopped';
const player = new Player();
let speaker = null;
let shoutcastResponse = null;

const dialogStartListener: (() => void) = () => {
  player.pause();
  if (speaker) {
    speaker.setVolume(0);
  }
};

const dialogEndListener: (() => void) = () => {
  player.resume();
  if (speaker) {
    speaker.setVolume(1);
  }
};

function readMusicDir(dir: string): Promise<Array<string>> {
  if (!songs) {
    return fs.readdir(dir)
    .then(files => {
      songs = files.filter(filename => ['.wav', '.m4a', '.mp3'].includes(filename.substr(-4)));
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

function shuffle(array) {
  let counter = array.length;

  while (counter > 0) {
    let index = Math.floor(Math.random() * counter);
    counter--;
    let temp = array[counter];
    array[counter] = array[index];
    array[index] = temp;
  }
  return array;
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
        dialogEngine.addListener(`dialog-start`, dialogStartListener);
        dialogEngine.addListener(`dialog-end`, dialogEndListener);
        return player.play(song).then(() => {
          log.debug(`Done playing song ${song}`);
          dialogEngine.removeListener(`dialog-start`, dialogStartListener);
          dialogEngine.removeListener(`dialog-end`, dialogEndListener);
        });
      } else {
        log.warn(`Ignoring play request as an explicit stop is requested`);
        return Promise.resolve();
      }
    });
  };

  let playPromise = Promise.resolve();
  songs = shuffle(songs); // Shuffle the songs in the array
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

export function* playShoutcast(
    environment: Environment,
): Generator<Object, void, any> {
  invariant(environment);

  const {speak, dialogEngine} = environment;
  invariant(speak);

  if (mediaState === 'playing') {
    yield call(speak, 'Songs are already playing', `idle`);
    return;
  }

  mediaState = 'playing';
  speaker = new Speaker();

  dialogEngine.addListener(`dialog-start`, dialogStartListener);
  dialogEngine.addListener(`dialog-end`, dialogEndListener);

  const onEnd = (error) => {
    if (error) {
      log.error(error.message);
    }
    log.info(`Shoutcast stream ended`);
    dialogEngine.removeListener(`dialog-start`, dialogStartListener);
    dialogEngine.removeListener(`dialog-end`, dialogEndListener);
    speaker = null;
    shoutcastResponse = null;
  };

  log.info(`Connecting to ${SHOUTCAST_URL}`);
  const req = icy.get(SHOUTCAST_URL, (res) => {
    if (res.headers['content-type'] !== 'audio/mpeg') {
      log.warn(res.headers);
      log.error('not an mpeg stream');
      return;
    }

    res.on('metadata', function (metadata) {
      const parsed = icy.parse(metadata);
      log.info(parsed);
    });

    res.pipe(new lame.Decoder()).pipe(speaker);
    res.on('data', () => {
      if (mediaState !== 'playing') {
        if (speaker) {
          speaker.setVolume(0);
        }
        res.removeAllListeners('data');
      }
    });
    shoutcastResponse = res;
    res.once('error', onEnd);
    res.once('end', onEnd);
  });
  req.once('error', onEnd);

  yield call(speak, 'OK', `idle`);
}

export function* pauseShoutcast(
    environment: Environment,
): Generator<Object, void, any> {
  invariant(environment);

  const {speak} = environment;
  invariant(speak);

  mediaState = 'stopped';

  log.debug(`Pausing the music`);
  if (shoutcastResponse) {
    shoutcastResponse.res.client.destroy();
  }

  yield call(speak, 'Pausing shoutcast', `idle`);
}
