/**
 * @flow
 */

import createLog from 'silk-log/device';
import {call, put, take} from 'redux-saga/effects';
import invariant from 'assert';
import {getDateTime, encodeRate} from './utils';

import {
  default as createEnvironment,
  startSaga,
  cleanupFinishedSagas,
} from './environment';

import modifyBabies from './babies/saga';
import startFeeding from './food/saga';
import {modifyTimers, getAlarmInfo, findAlarmInfo} from './timers/saga';
import {
  requestFactoryReset,
  setNightlightColor,
  setUiMode,
  setVolume,
} from './ui/saga';
import {getStockPrice} from './stocks/saga';
import {xkcd} from './xkcd/saga';
import {getWeather, resetLocation} from './weather/saga';
import {
  pauseSonos,
  playSonos,
  getCurrentSong,
  getArtist,
  playMusic,
  pauseMusic,
} from './music/saga';
import {turnOnLight, turnOffLight} from './lights/saga';
import {recordKeyword} from './keyword/saga';
import {spellWord} from './spelling/saga';

import type {DialogEngine} from 'silk-dialog-engine';

import type {
  Environment,
  SagaFunction,
  SagasInProgress,
} from './environment';

const log = createLog(`dialog-script-saga`);

// Text that gets spoken whenever we can't figure out what the user wants.
export const unknownText = `Sorry, I'm not understanding you.`;

/**
 * |independentIntents| lists those intents that will trigger sagas that will
 * continue to run without constant voice interaction (e.g. a saga that sets a
 * long timeout or performs a network request). We do not currently allow more
 * than one of these sagas to be active at a time and so they are referred to as
 *  "independent" sagas. They may run concurrently with one of the
 * "concurrent" sagas, see below.
 */
const independentIntents: Set<string> = new Set([
  `register`,
  `rename`,
  `startBottleFeeding`,
  `startFeeding`,
  `startNursing`,
]);

/**
 * |concurrentIntents| lists those intents that will trigger sagas that are
 * constantly interacting with the user via voice (e.g. simple queries like
 * "what time is it?" => "it is now 7 am" or simple commands like "turn off
 * the music"). These sagas may run during another "independent" saga, see
 * above.
 */
const concurrentIntents: Set<string> = new Set([
  `builtin.intent.weather.check_weather`,
  `builtin.intent.alarm.delete_alarm`,
  `builtin.intent.alarm.turn_off_alarm`,
  `builtin.intent.alarm.set_alarm`,
  `builtin.intent.alarm.time_remaining`,
  `builtin.intent.alarm.find_alarm`,
  `cancelTimer`,
  `getCurrentTime`,
  `getSoftwareVersion`,
  `factoryReset`,
  `getArtist`,
  `getCurrentSong`,
  `getStockPrice`,
  `pauseSonos`,
  `playSonos`,
  `pauseMusic`,
  `playMusic`,
  `recordKeyword`,
  `resetLocation`,
  `xkcd`,
  `setNightlightColor`,
  `setUiMode`,
  `setVolume`,
  `startTimer`,
  `turnOff`,
  `turnOn`,
  `spellWord`,
]);

// A simple saga that speaks the current time.
export function* sayCurrentTime(
  environment: Environment,
): Generator<Object, void, any> {
  const {speak} = environment;

  let [timeString, dateString] = getDateTime();

  /**
   * Instruct the saga runtime to "call the speak function with these
   * arguments". The |call| function is not absolutely essential (you could also
   * simply write |yield speak(...)|, but then there would be no way to test the
   * |sayCurrentTime| generator step-by-step. By using the |call| function we
   * can write unit tests that run the generator one step at a time.
   */
  yield call(speak, `The time is ${timeString} on ${dateString}`, `idle`);
}

export function* saySoftwareVersion(
  environment: Environment,
): Generator<Object, void, any> {
  const {speak} = environment;

  /**
   * Instruct the saga runtime to "call the speak function with these
   * arguments". The |call| function is not absolutely essential (you could also
   * simply write |yield speak(...)|, but then there would be no way to test the
   * |sayCurrentTime| generator step-by-step. By using the |call| function we
   * can write unit tests that run the generator one step at a time.
   */
  const silkVersion = require('silk-core-version');
  let version = (silkVersion.official ? 'Official ' : '') +
                silkVersion.semver + ' on ' + silkVersion.branch +
                ' with a sha1 of ' + encodeRate(silkVersion.sha.substr(0, 8), 'slow');
  yield call(speak, version, 'idle');
}

/**
 * This is our main saga. There are two phases:
 *
 * 1. Initialization.
 * 2. An infinite loop waiting for user interaction.
 *
 * See below.
 */
export default function*(
  dialogEngine: DialogEngine,
): Generator<Object | Array<Object>, void, any> {
  log.info(`Starting saga`);

  /**
   * We are currently set up to handle at most one "independent" saga and one
   * "concurrent" saga at the same time. We can make this much more
   * sophisticated in the future if needed.
   */
  const sagas: SagasInProgress = {
    independent: null,
    concurrent: null,
  };

  /**
   * Phase 1: Initialization.
   *
   * |createEnvironment| creates the |environment| object that contains all the
   * functions we need to interact with the outside world. We can communicate
   * with the user via the |speak| function and the user can communicate with us
   * via the |micChannel| (which allows us to sleep while waiting for speech
   * events.
   *
   * |micChannel| delivers events that look like this:
   *
   *   {
   *     text (string):
   *       Raw speech-to-text results.
   *     intent (string):
   *       Our best guess as to what the user "intends" to do.
   *     entities (Array<string>):
   *       Any entities associated with the intent.
   *   }
   *
   * |createEnvironment| also starts various long-running concurrent sagas (e.g.
   * sagas that monitor system timers).
   *
   * Note: We use |yield*| here because |createEnvironment| is not a
   * self-contained saga; it is merely a helper function, and we do not want to
   * wait for all of its subtasks to complete before returning control to us.
   */
  const environment = yield* createEnvironment(dialogEngine);
  invariant(environment);

  // Pull the stuff we care about out of |environment|.
  const {micChannel, speak} = environment;

  log.debug(`Starting dialog loop`);

  /**
   * Phase 2: An infinite loop.
   *
   * We sleep while waiting for the user to speak and for that speech to be
   * processed into an event on the |micChannel|. Once we wake up we may launch
   * other sagas as necessary before sleeping again.
   */
  while (true) {                    // eslint-disable-line no-constant-condition
    log.debug(`Waiting for next intent`);

    /**
     * The |take| function instructs the saga runtime to suspend this saga
     * until an event is available on the |micChannel|. Most of the time we
     * should be asleep here.
     */
    const event = yield take(micChannel);
    invariant(event);

    /**
     * |micChannel| has given us an event, so now we have to decide what to do
     * with it.
     */
    const {intent, entities} = event;
    log.debug(`Got intent`, intent, entities);

    /**
     * Before we start other sagas we make sure to clean up any previous sagas
     * that are no longer running. This might free up a slot in |sagas| so that
     * we can start another.
     */
    yield call(cleanupFinishedSagas, sagas);

    // Handle independent sagas first.
    if (!sagas.independent && independentIntents.has(intent)) {
      /**
       * We need to know which saga function to call and the arguments that it
       * needs.
       */
      let sagaFunction: ?SagaFunction = null;
      let args: Array<any> = [];

      switch (intent) {
      case `startFeeding`:
        sagaFunction = startFeeding;
        args.push(null);
        break;
      case `startNursing`:
        sagaFunction = startFeeding;
        args.push(`nursing`);
        break;
      case `startBottleFeeding`:
        sagaFunction = startFeeding;
        args.push(`bottle`);
        break;
      case `register`:
        sagaFunction = modifyBabies;
        args.push(`add`);
        break;
      case `rename`:
        sagaFunction = modifyBabies;
        args.push(`rename`);
        break;
      default:
        throw new Error(`All intents in independentIntents must be handled!`);
      }

      invariant(sagaFunction);

      /**
       * |startSaga| takes care of creating "tee" channels for the new saga. By
       * default the |micChannel| is a simple FIFO pipe and there is a 1:1
       * relationship between events that get pushed onto the channel and the
       * events that are yielded with |take|. We want to "tee" events to
       * multiple sagas so we need to make additional channels.
       *
       * We use |yield*| because |startSaga| forks the saga directly and we
       * don't want to wait for those sagas to complete before control is
       * returned to this function.
       */
      sagas.independent = yield* startSaga(sagaFunction, environment, ...args);
      log.debug(`Sagas`, sagas);
      invariant(sagas.independent);

      // This intent has now been consumed, no need to pass it to others.
      continue;
    }

    // Handle concurrent sagas.
    if (!sagas.concurrent && concurrentIntents.has(intent)) {
      /**
       * This is nearly identical to the way we handled |independentIntents|
       * above, except that we're storing the result in a different slot on
       * |sagas|.
       */
      let sagaFunction: ?SagaFunction = null;
      let args: Array<any> = [];

      switch (intent) {
      case `getCurrentTime`:
        sagaFunction = sayCurrentTime;
        break;
      case `getSoftwareVersion`:
        sagaFunction = saySoftwareVersion;
        break;
      case `startTimer`:
        sagaFunction = modifyTimers;
        args.push(`startTimer`, entities);
        break;
      case `builtin.intent.alarm.set_alarm`:
        sagaFunction = modifyTimers;
        args.push(`startAlarm`, entities);
        break;
      case `builtin.intent.alarm.time_remaining`:
        sagaFunction = getAlarmInfo;
        args.push(entities);
        break;
      case `builtin.intent.alarm.find_alarm`:
        sagaFunction = findAlarmInfo;
        args.push(entities);
        break;
      case `cancelTimer`:
        sagaFunction = modifyTimers;
        args.push(`cancelTimer`, entities);
        break;
      case `builtin.intent.alarm.delete_alarm`:
      case `builtin.intent.alarm.turn_off_alarm`:
        sagaFunction = modifyTimers;
        args.push(`cancelAlarm`, entities);
        break;
      case `factoryReset`:
        sagaFunction = requestFactoryReset;
        break;
      case `setVolume`:
        sagaFunction = setVolume;
        args.push(entities);
        break;
      case `setNightlightColor`:
        sagaFunction = setNightlightColor;
        args.push(entities);
        break;
      case `setUiMode`:
        sagaFunction = setUiMode;
        args.push(entities);
        break;
      case `getStockPrice`:
        sagaFunction = getStockPrice;
        args.push(entities);
        break;
      case `builtin.intent.weather.check_weather`:
        sagaFunction = getWeather;
        args.push(entities);
        break;
      case `xkcd`:
        sagaFunction = xkcd;
        args.push(entities);
        break;
      case `resetLocation`:
        sagaFunction = resetLocation;
        break;
      case `playSonos`:
        sagaFunction = playSonos;
        break;
      case `pauseSonos`:
        sagaFunction = pauseSonos;
        break;
      case `playMusic`:
        sagaFunction = playMusic;
        break;
      case `pauseMusic`:
        sagaFunction = pauseMusic;
        break;
      case `getCurrentSong`:
        sagaFunction = getCurrentSong;
        break;
      case `getArtist`:
        sagaFunction = getArtist;
        break;
      case `turnOn`:
        if (entities.length && (entities[0].type === 'light')) {
          sagaFunction = turnOnLight;
        }
        break;
      case `turnOff`:
        if (entities.length && (entities[0].type === 'light')) {
          sagaFunction = turnOffLight;
        }
        break;
      case `recordKeyword`:
        sagaFunction = recordKeyword;
        args.push(entities);
        break;
      case `spellWord`:
        sagaFunction = spellWord;
        args.push(entities);
        break;
      default:
        throw new Error(`All intents in concurrentIntents must be handled!`);
      }

      if (sagaFunction) {
        // See comment about |startSaga| above.
        sagas.concurrent = yield* startSaga(sagaFunction, environment, ...args);
        invariant(sagas.concurrent);

        // This intent has now been consumed, no need to pass it to others.
        continue;
      }

      // If reached here, intent has not been consumed, continue onward
    }

    /**
     * We received some intent that is either not in |independentIntents| and
     * |concurrentIntents|, or it is but the slot is taken by another saga.
     * All we can do is pass the intent along to the sagas that are already
     * running. |put| pushes events onto each saga's |micChannel|.
     */
    if (sagas.concurrent) {
      yield put(sagas.concurrent.micChannel, event);
    }

    if (sagas.independent) {
      yield put(sagas.independent.micChannel, event);
    }

    /**
     * If there are no active sagas then this intent must be one that we simply
     * don't understand. Call the |speak| function to tell the user.
     */
    if (!sagas.independent && !sagas.concurrent) {
      log.warn(`Unknown intent: '${event.text}' => '${intent}'`, entities);
      yield call(speak, unknownText, `idle`);
    }
  }
}
