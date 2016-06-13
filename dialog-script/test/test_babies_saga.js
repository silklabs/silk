/* global suite */
/* global setup */
/* global test */

import assert from 'assert';
import {call, put, select, take} from 'redux-saga/effects';

import {testScript} from './utils';
import {
  default as saga,
  getNextBabyId,
  getBabies,
  queryBabyName,
  add,
  rename,
} from '../lib/babies/saga';
import {
  addBaby,
  renameBaby,
} from '../lib/babies/actions';

suite(`babies/saga`, () => {

  const environment = {
    dialogEngine: {},
    textChannel: () => {},
    intentChannel: () => {},
    speak: () => {},
  };

  test(`unknown type`, () => {
    const type = `foo`;
    const sagaGenerator = saga(environment, type);
    assert.throws(
      () => sagaGenerator.next(),
      function(error) {
        return error.message === `Unknown type '${type}'`;
      }
    );
  });

  test(`add`, () => {
    const sagaGenerator = saga(environment, `add`);
    testScript(sagaGenerator, [
      {
        expect: call(add, environment),
      },
    ]);
  });

  test(`rename`, () => {
    const sagaGenerator = saga(environment, `rename`);
    testScript(sagaGenerator, [
      {
        expect: call(rename, environment),
      },
    ]);
  });

  suite(`queryBabyName`, () => {

    let sagaGenerator = null;

    setup(() => {
      sagaGenerator = queryBabyName(environment);
      assert(sagaGenerator);
    });

    test(`0 retries, 0 corrections`, () => {
      const name = `jill`;
      testScript(sagaGenerator, [
        {
          expect: call(environment.speak, `What is the baby's name?`, false),
        }, {
          expect: take(environment.textChannel),
        }, {
          provide: name,
          expect: call(environment.speak,
                       `I heard ${name}. Is that correct?`,
                       false),
        }, {
          expect: take(environment.intentChannel),
        }, {
          provide: {intent: `confirm`, entities: []},
          expect: name,
          done: true,
        },
      ]);
    });

    test(`1 retry, 0 corrections`, () => {
      const name = `jill`;
      testScript(sagaGenerator, [
        {
          expect: call(environment.speak, `What is the baby's name?`, false),
        }, {
          expect: take(environment.textChannel),
        }, {
          provide: ``,
          expect: call(environment.speak,
                       `Sorry, I'll try again. What is the baby's name?`,
                       false),
        }, {
          expect: take(environment.textChannel),
        }, {
          provide: name,
          expect: call(environment.speak,
                       `I heard ${name}. Is that correct?`,
                       false),
        }, {
          expect: take(environment.intentChannel),
        }, {
          provide: {intent: `confirm`, entities: []},
          expect: name,
          done: true,
        },
      ]);
    });

    test(`1 retry, 1 correction`, () => {
      const name = `jill`;
      testScript(sagaGenerator, [
        {
          expect: call(environment.speak, `What is the baby's name?`, false),
        }, {
          expect: take(environment.textChannel),
        }, {
          provide: name,
          expect: call(environment.speak,
                       `I heard ${name}. Is that correct?`,
                       false),
        }, {
          expect: take(environment.intentChannel),
        }, {
          provide: {intent: `unknown`, entities: []},
          expect: call(environment.speak,
                       `Sorry, I'll try again. What is the baby's name?`,
                       false),
        }, {
          expect: take(environment.textChannel),
        }, {
          provide: name,
          expect: call(environment.speak,
                       `I heard ${name}. Is that correct?`,
                       false),
        }, {
          expect: take(environment.intentChannel),
        }, {
          provide: {intent: `confirm`, entities: []},
          expect: name,
          done: true,
        },
      ]);
    });

    test(`2 retries, 1 correction`, () => {
      const name = `jill`;
      testScript(sagaGenerator, [
        {
          expect: call(environment.speak, `What is the baby's name?`, false),
        }, {
          expect: take(environment.textChannel),
        }, {
          provide: ``,
          expect: call(environment.speak,
                       `Sorry, I'll try again. What is the baby's name?`,
                       false),
        }, {
          expect: take(environment.textChannel),
        }, {
          provide: name,
          expect: call(environment.speak,
                       `I heard ${name}. Is that correct?`,
                       false),
        }, {
          expect: take(environment.intentChannel),
        }, {
          provide: {intent: `unknown`, entities: []},
          expect: call(environment.speak,
                       `Sorry, I'll try again. What is the baby's name?`,
                       false),
        }, {
          expect: take(environment.textChannel),
        }, {
          provide: name,
          expect: call(environment.speak,
                       `I heard ${name}. Is that correct?`,
                       false),
        }, {
          expect: take(environment.intentChannel),
        }, {
          provide: {intent: `confirm`, entities: []},
          expect: name,
          done: true,
        },
      ]);
    });

    test(`3 retries, 2 corrections (too many retries)`, () => {
      const name = `jill`;
      testScript(sagaGenerator, [
        {
          expect: call(environment.speak, `What is the baby's name?`, false),
        }, {
          expect: take(environment.textChannel),
        }, {
          provide: ``,
          expect: call(environment.speak,
                       `Sorry, I'll try again. What is the baby's name?`,
                       false),
        }, {
          expect: take(environment.textChannel),
        }, {
          provide: name,
          expect: call(environment.speak,
                       `I heard ${name}. Is that correct?`,
                       false),
        }, {
          expect: take(environment.intentChannel),
        }, {
          provide: {intent: `unknown`, entities: []},
          expect: call(environment.speak,
                       `Sorry, I'll try again. What is the baby's name?`,
                       false),
        }, {
          expect: take(environment.textChannel),
        }, {
          provide: name,
          expect: call(environment.speak,
                       `I heard ${name}. Is that correct?`,
                       false),
        }, {
          expect: take(environment.intentChannel),
        }, {
          provide: {intent: `unknown`, entities: []},
          expect: call(environment.speak,
                       `Sorry I'm having trouble. Please try again later.`,
                       true),
        }, {
          expect: ``,
          done: true,
        },
      ]);
    });

  });

  suite(`add`, () => {

    let sagaGenerator = null;

    setup(() => {
      sagaGenerator = add(environment);
      assert(sagaGenerator);
    });

    test(`no name`, () => {
      testScript(sagaGenerator, [
        {
          expect: call(queryBabyName, environment),
        }, {
          provide: ``,
          done: true,
        },
      ]);
    });

    test(`name`, () => {
      const name = `bob`;
      const id = 10;
      testScript(sagaGenerator, [
        {
          expect: call(queryBabyName, environment),
        }, {
          provide: name,
          expect: select(getNextBabyId),
        }, {
          provide: id,
          expect: put(addBaby(id, name)),
        }, {
          expect: call(environment.speak,
                       `Ok, ${name} is now registered`,
                       true),
        }, {
          done: true,
        },
      ]);
    });

  });

  suite(`rename`, () => {

    let sagaGenerator = null;

    setup(() => {
      sagaGenerator = rename(environment);
      assert(sagaGenerator);
    });

    test(`no babies`, () => {
      testScript(sagaGenerator, [
        {
          expect: select(getBabies),
        }, {
          provide: [],
          expect: call(environment.speak,
                       `You haven't registered any babies yet.`,
                       true),
        }, {
          done: true,
        },
      ]);
    });

    test(`1 baby`, () => {
      const oldName = `beth`;
      const newName = `elizabeth`;
      const id = 2;
      testScript(sagaGenerator, [
        {
          expect: select(getBabies),
        }, {
          provide: [{id, name: oldName}],
          expect: call(queryBabyName, environment),
        }, {
          provide: newName,
          expect: put(renameBaby(id, newName)),
        }, {
          expect: call(environment.speak,
                       `Ok, I've changed the baby's name to ${newName}.`,
                       true),
        }, {
          done: true,
        },
      ]);
    });

    test(`1 baby, no name`, () => {
      const oldName = `beth`;
      const id = 2;
      testScript(sagaGenerator, [
        {
          expect: select(getBabies),
        }, {
          provide: [{id, name: oldName}],
          expect: call(queryBabyName, environment),
        }, {
          provide: ``,
          done: true,
        },
      ]);
    });

    test(`multiple babies`, () => {
      const oldName = `bill`;
      const newName = `william`;
      const id = 4;
      testScript(sagaGenerator, [
        {
          expect: select(getBabies),
        }, {
          provide: [{id, name: oldName}, {id: 5, name: `john`}],
          expect: call(queryBabyName,
                       environment,
                       `What is the name you told me previously?`),
        }, {
          provide: oldName,
          expect: call(queryBabyName, environment),
        }, {
          provide: newName,
          expect: put(renameBaby(id, newName)),
        }, {
          expect: call(environment.speak,
                       `Ok, I've changed the baby's name to ${newName}.`,
                       true),
        }, {
          done: true,
        },
      ]);
    });

    test(`multiple babies, no old name`, () => {
      const oldName = `bill`;
      const id = 4;
      testScript(sagaGenerator, [
        {
          expect: select(getBabies),
        }, {
          provide: [{id, name: oldName}, {id: 5, name: `john`}],
          expect: call(queryBabyName,
                       environment,
                       `What is the name you told me previously?`),
        }, {
          provide: oldName,
          expect: call(queryBabyName, environment),
        }, {
          provide: ``,
          done: true,
        },
      ]);
    });

    test(`multiple babies, 1 retry`, () => {
      const oldName = `bill`;
      const newName = `william`;
      const id = 4;
      testScript(sagaGenerator, [
        {
          expect: select(getBabies),
        }, {
          provide: [{id, name: oldName}, {id: 5, name: `john`}],
          expect: call(queryBabyName,
                       environment,
                       `What is the name you told me previously?`),
        }, {
          provide: `piper`,
          expect: call(environment.speak,
                       `Sorry, I don't have any baby registered with that name.`,
                       true),
        }, {
          expect: call(queryBabyName,
                       environment,
                       `What is the name you told me previously?`),
        }, {
          provide: oldName,
          expect: call(queryBabyName, environment),
        }, {
          provide: newName,
          expect: put(renameBaby(id, newName)),
        }, {
          expect: call(environment.speak,
                       `Ok, I've changed the baby's name to ${newName}.`,
                       true),
        }, {
          done: true,
        },
      ]);
    });

    test(`multiple babies, 2 retries`, () => {
      const oldName = `bill`;
      const newName = `william`;
      const id = 4;
      testScript(sagaGenerator, [
        {
          expect: select(getBabies),
        }, {
          provide: [{id, name: oldName}, {id: 5, name: `john`}],
          expect: call(queryBabyName,
                       environment,
                       `What is the name you told me previously?`),
        }, {
          provide: `piper`,
          expect: call(environment.speak,
                       `Sorry, I don't have any baby registered with that name.`,
                       true),
        }, {
          expect: call(queryBabyName,
                       environment,
                       `What is the name you told me previously?`),
        }, {
          provide: `piper`,
          expect: call(environment.speak,
                       `Sorry, I don't have any baby registered with that name.`,
                       true),
        }, {
          expect: call(queryBabyName,
                       environment,
                       `What is the name you told me previously?`),
        }, {
          provide: oldName,
          expect: call(queryBabyName, environment),
        }, {
          provide: newName,
          expect: put(renameBaby(id, newName)),
        }, {
          expect: call(environment.speak,
                       `Ok, I've changed the baby's name to ${newName}.`,
                       true),
        }, {
          done: true,
        },
      ]);
    });

    test(`multiple babies, 3 retries (too many retries)`, () => {
      const oldName = `bill`;
      const id = 4;
      testScript(sagaGenerator, [
        {
          expect: select(getBabies),
        }, {
          provide: [{id, name: oldName}, {id: 5, name: `john`}],
          expect: call(queryBabyName,
                       environment,
                       `What is the name you told me previously?`),
        }, {
          provide: `piper`,
          expect: call(environment.speak,
                       `Sorry, I don't have any baby registered with that name.`,
                       true),
        }, {
          expect: call(queryBabyName,
                       environment,
                       `What is the name you told me previously?`),
        }, {
          provide: `piper`,
          expect: call(environment.speak,
                       `Sorry, I don't have any baby registered with that name.`,
                       true),
        }, {
          expect: call(queryBabyName,
                       environment,
                       `What is the name you told me previously?`),
        }, {
          provide: `piper`,
          expect: call(environment.speak,
                       `Sorry I'm having trouble. Please try again later.`,
                       true),
        }, {
          done: true,
        },
      ]);
    });

  });

});
