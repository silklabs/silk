/* global suite */
/* global test */

import assert from 'assert';
import {EventEmitter} from 'events';

import createEnvironment from '../lib/environment';

suite(`environment`, () => {

  // So far all we care about here is that the DialogEngine has |addListener|
  // and |removeListener|.
  const dialogEngine = new EventEmitter();

  test(`createEnvironment`, () => {
    const environment = createEnvironment(dialogEngine);
    assert(environment);

    assert.strictEqual(environment.dialogEngine, dialogEngine);
    assert(environment.textChannel); // TODO make better.
    assert(environment.intentChannel); // TODO make better.
    assert(environment.speak);
    assert(environment.speak instanceof Function);
  });

});
