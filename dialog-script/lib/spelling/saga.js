/**
 * @flow
 */

import {call} from 'redux-saga/effects';
import invariant from 'assert';
import {encodeBreak} from '../utils';

import type {Environment} from '../environment';
import type {Entities} from 'silk-dialog-engine';

export function* spellWord(
  environment: Environment,
  entities: Entities
): Generator<Object, void, any> {
  invariant(environment);

  const {speak} = environment;
  invariant(speak);

  let word: string = '';
  for (let entity of entities) {
    if ((entity.type === 'word') && entity.entity) {
      word = entity.entity;
      break;
    }
  }

  if (!word) {
    yield call(speak, `Sorry, I'm not sure which word you want me to spell`, `idle`);
    return;
  }

  let spell = '';
  for (let i = 0; i < word.length; i++) {
    spell = spell + encodeBreak(word.charAt(i), 'x-weak');
  }

  yield call(speak, spell, `idle`);
}
