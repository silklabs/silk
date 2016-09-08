import assert from 'assert';
import eventToPromise from 'event-to-promise';
import mock from 'mock-require';

import * as mockDialogEngine from './mock/dialog-engine';
import * as mockFactoryReset from './mock/mock-silk-factory-reset';
import * as mockLifx from './mock/mock-silk-lifx';
import * as mockLights from './mock/mock-silk-lights';
import * as mockSonos from './mock/mock-silk-sonos';
import * as mockStorage from './mock/dialog-storage';
import * as mockVolume from './mock/mock-silk-volume';
import * as mockSysutils from './mock/mock-silk-sysutils';
import * as mockAudioPlayer from './mock/mock-silk-audioplayer';
import * as mockOutbox from './mock/mock-silk-outbox';
import * as mockStreams from './mock/mock-silk-streams';

import createLog from 'silk-log';
const log = createLog(`dialog-script-test-utils`);

export function installMocks() {
  log.info('installing mocks');
  mock('silk-dialog-engine', mockDialogEngine);
  mock('silk-dialog-storage', mockStorage);
  mock('silk-factory-reset', mockFactoryReset);
  mock('silk-lifx', mockLifx);
  mock('silk-lights', mockLights);
  mock('silk-sonos', mockSonos);
  mock('silk-volume', mockVolume);
  mock('silk-sysutils', mockSysutils);
  mock('silk-audioplayer', mockAudioPlayer);
  mock('silk-outbox', mockOutbox);
  mock('silk-streams', mockStreams);
}

export function uninstallMocks() {
  mock.stopAll();
}

export function testScript(generator, script) {
  assert(generator, `No 'generator' passed`);
  assert(`next` in generator, `Generator doesn't have a 'next' property`);
  assert.strictEqual(typeof generator.next, `function`);

  assert(script, `No 'script' passed`);
  assert(Array.isArray(script), `Script is not an array`);
  assert(script.length, `Script is an empty array`);

  let lastError = null;

  script.forEach((state, index) => {
    try {
      assert(state, `Script[${index}] is empty`);
      assert.equal(typeof state, `object`);

      const keys = Object.keys(state);
      assert(keys.length <= 4, `Script[${index}] has too many keys`);
      keys.forEach((key) => {
        assert(key === `provide` ||
               key === `expect` ||
               key === `error` ||
               key === `done`,
               `Script[${index}] has an unsupported key '${key}'`);
      });

      const {provide, expect, error, done} = state;

      assert(!error || !provide,
             `Script[${index}] has both an 'error' and a 'provide' key`);

      let next;
      try {
        next = error ? generator.throw(error) : generator.next(provide);
      } catch (e) {
        if (lastError) {
          assert.strictEqual(e, lastError);
          lastError = null;
          next = generator.next(provide);
        } else {
          throw e;
        }
      }
      lastError = error;
      assert.deepStrictEqual(next.value, expect);
      if (done) {
        assert.strictEqual(next.done, done);
      } else {
        assert(!next.done, `Script[${index}] finished early`);
      }
    } catch (error) {
      console.error(`State[${index}] Error: %s`, error); // eslint-disable-line no-console
      throw error;
    }
  });
}

export async function testUserScript(dialogEngine, script): Promise<void> {
  assert(dialogEngine);
  assert(script, `No 'script' passed`);
  assert(Array.isArray(script), `Script is not an array`);
  assert(script.length, `Script is an empty array`);

  let index = 0;

  try {
    for ( ; index < script.length; index++) {
      const state = script[index];

      assert(typeof state.speak === `string`,
             `State[${index}] speak is not a string`);
      assert(typeof state.hear === `string`,
             `State[${index}] hear is not a string`);
      assert(typeof state.nextState === `string`,
             `State[${index}] nextState is not a boolean`);

      dialogEngine._mockInterpret(state.speak);

      const [text, nextState] = await eventToPromise(dialogEngine,
                                                    `mock-speech`,
                                                    {array: true});

      assert.strictEqual(text, state.hear);
      assert.strictEqual(nextState, state.nextState);
    }
  } catch (error) {
    console.error(`State[${index}] Error: %s`, error); // eslint-disable-line no-console
    throw error;
  }
}

export function makeMicEvent(text = ``, intent = `unknown`, entities = []) {
  return {
    text,
    intent,
    entities,
  };
}

export class UserScriptTester {
  constructor() {
    this._dialogEngine = null;
    this._reload = null;
  }

  suiteSetup() {
    installMocks();
    mockDialogEngine.createDialogEngine({});

    // This configures the dialog engine.
    this._reload = require('../lib/index').reload;
    assert(this._reload);
  }

  suiteTeardown() {
    uninstallMocks();
  }

  setup() {
    assert(this._reload);
    this._reload();

    this._dialogEngine = mockDialogEngine.default();
    assert(this._dialogEngine);
  }

  speak(text) {
    setTimeout(() => this._dialogEngine._mockInterpret(text), 500);
  }

  listen() {
    return eventToPromise(this._dialogEngine, `mock-speech`, {array: true});
  }

  async listenCheck(regexText, finished) {
    let results = {};
    [results.text, results.finished] = await this.listen();

    log.info(`Reponse: ${results.text} ${results.finished}`);
    assert.equal(results.finished, finished,
        `Expecting: '${finished}', got: '${results.finished}'`);

    let match = results.text.match(RegExp(regexText, 'i'));
    assert(match, `Expecting: '${regexText}', got: '${results.text}'`);
  }
}
