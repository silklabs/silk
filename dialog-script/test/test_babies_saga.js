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

  const dialogEngine = {};
  const sagaArgs = {
    dialogEngine,
    textChannel: () => {},
    intentChannel: () => {},
    speak: () => {},
  };

  test(`unknown type`, () => {
    const type = `foo`;
    const sagaGenerator = saga(sagaArgs, type);
    assert.throws(
      () => sagaGenerator.next(),
      function(error) {
        return error.message === `Unknown type '${type}'`;
      }
    );
  });

  test(`add`, () => {
    const sagaGenerator = saga(sagaArgs, `add`);
    testScript(sagaGenerator, [
      {
        expect: call(add, sagaArgs),
      },
    ]);
  });

  test(`rename`, () => {
    const sagaGenerator = saga(sagaArgs, `rename`);
    testScript(sagaGenerator, [
      {
        expect: call(rename, sagaArgs),
      },
    ]);
  });

  suite(`queryBabyName`, () => {

    let sagaGenerator = null;

    setup(() => {
      sagaGenerator = queryBabyName(sagaArgs);
      assert(sagaGenerator);
    });

    test(`0 retries, 0 corrections`, () => {
      const name = `jill`;
      testScript(sagaGenerator, [
        {
          expect: call(sagaArgs.speak, `What is the baby's name?`, false),
        }, {
          expect: take(sagaArgs.textChannel),
        }, {
          provide: name,
          expect: call(sagaArgs.speak,
                       `I heard ${name}. Is that correct?`,
                       false),
        }, {
          expect: take(sagaArgs.intentChannel),
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
          expect: call(sagaArgs.speak, `What is the baby's name?`, false),
        }, {
          expect: take(sagaArgs.textChannel),
        }, {
          provide: ``,
          expect: call(sagaArgs.speak,
                       `Sorry, I'll try again. What is the baby's name?`,
                       false),
        }, {
          expect: take(sagaArgs.textChannel),
        }, {
          provide: name,
          expect: call(sagaArgs.speak,
                       `I heard ${name}. Is that correct?`,
                       false),
        }, {
          expect: take(sagaArgs.intentChannel),
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
          expect: call(sagaArgs.speak, `What is the baby's name?`, false),
        }, {
          expect: take(sagaArgs.textChannel),
        }, {
          provide: name,
          expect: call(sagaArgs.speak,
                       `I heard ${name}. Is that correct?`,
                       false),
        }, {
          expect: take(sagaArgs.intentChannel),
        }, {
          provide: {intent: `unknown`, entities: []},
          expect: call(sagaArgs.speak,
                       `Sorry, I'll try again. What is the baby's name?`,
                       false),
        }, {
          expect: take(sagaArgs.textChannel),
        }, {
          provide: name,
          expect: call(sagaArgs.speak,
                       `I heard ${name}. Is that correct?`,
                       false),
        }, {
          expect: take(sagaArgs.intentChannel),
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
          expect: call(sagaArgs.speak, `What is the baby's name?`, false),
        }, {
          expect: take(sagaArgs.textChannel),
        }, {
          provide: ``,
          expect: call(sagaArgs.speak,
                       `Sorry, I'll try again. What is the baby's name?`,
                       false),
        }, {
          expect: take(sagaArgs.textChannel),
        }, {
          provide: name,
          expect: call(sagaArgs.speak,
                       `I heard ${name}. Is that correct?`,
                       false),
        }, {
          expect: take(sagaArgs.intentChannel),
        }, {
          provide: {intent: `unknown`, entities: []},
          expect: call(sagaArgs.speak,
                       `Sorry, I'll try again. What is the baby's name?`,
                       false),
        }, {
          expect: take(sagaArgs.textChannel),
        }, {
          provide: name,
          expect: call(sagaArgs.speak,
                       `I heard ${name}. Is that correct?`,
                       false),
        }, {
          expect: take(sagaArgs.intentChannel),
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
          expect: call(sagaArgs.speak, `What is the baby's name?`, false),
        }, {
          expect: take(sagaArgs.textChannel),
        }, {
          provide: ``,
          expect: call(sagaArgs.speak,
                       `Sorry, I'll try again. What is the baby's name?`,
                       false),
        }, {
          expect: take(sagaArgs.textChannel),
        }, {
          provide: name,
          expect: call(sagaArgs.speak,
                       `I heard ${name}. Is that correct?`,
                       false),
        }, {
          expect: take(sagaArgs.intentChannel),
        }, {
          provide: {intent: `unknown`, entities: []},
          expect: call(sagaArgs.speak,
                       `Sorry, I'll try again. What is the baby's name?`,
                       false),
        }, {
          expect: take(sagaArgs.textChannel),
        }, {
          provide: name,
          expect: call(sagaArgs.speak,
                       `I heard ${name}. Is that correct?`,
                       false),
        }, {
          expect: take(sagaArgs.intentChannel),
        }, {
          provide: {intent: `unknown`, entities: []},
          expect: call(sagaArgs.speak,
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
      sagaGenerator = add(sagaArgs);
      assert(sagaGenerator);
    });

    test(`no name`, () => {
      testScript(sagaGenerator, [
        {
          expect: call(queryBabyName, sagaArgs),
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
          expect: call(queryBabyName, sagaArgs),
        }, {
          provide: name,
          expect: select(getNextBabyId),
        }, {
          provide: id,
          expect: put(addBaby(id, name)),
        }, {
          expect: call(sagaArgs.speak, `Ok, ${name} is now registered`, true),
        }, {
          done: true,
        },
      ]);
    });

  });

  suite(`rename`, () => {

    let sagaGenerator = null;

    setup(() => {
      sagaGenerator = rename(sagaArgs);
      assert(sagaGenerator);
    });

    test(`no babies`, () => {
      testScript(sagaGenerator, [
        {
          expect: select(getBabies),
        }, {
          provide: [],
          expect: call(sagaArgs.speak,
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
          expect: call(queryBabyName, sagaArgs),
        }, {
          provide: newName,
          expect: put(renameBaby(id, newName)),
        }, {
          expect: call(sagaArgs.speak,
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
          expect: call(queryBabyName, sagaArgs),
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
                       sagaArgs,
                       `What is the name you told me previously?`),
        }, {
          provide: oldName,
          expect: call(queryBabyName, sagaArgs),
        }, {
          provide: newName,
          expect: put(renameBaby(id, newName)),
        }, {
          expect: call(sagaArgs.speak,
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
                       sagaArgs,
                       `What is the name you told me previously?`),
        }, {
          provide: oldName,
          expect: call(queryBabyName, sagaArgs),
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
                       sagaArgs,
                       `What is the name you told me previously?`),
        }, {
          provide: `piper`,
          expect: call(sagaArgs.speak,
                       `Sorry, I don't have any baby registered with that name.`,
                       true),
        }, {
          expect: call(queryBabyName,
                       sagaArgs,
                       `What is the name you told me previously?`),
        }, {
          provide: oldName,
          expect: call(queryBabyName, sagaArgs),
        }, {
          provide: newName,
          expect: put(renameBaby(id, newName)),
        }, {
          expect: call(sagaArgs.speak,
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
                       sagaArgs,
                       `What is the name you told me previously?`),
        }, {
          provide: `piper`,
          expect: call(sagaArgs.speak,
                       `Sorry, I don't have any baby registered with that name.`,
                       true),
        }, {
          expect: call(queryBabyName,
                       sagaArgs,
                       `What is the name you told me previously?`),
        }, {
          provide: `piper`,
          expect: call(sagaArgs.speak,
                       `Sorry, I don't have any baby registered with that name.`,
                       true),
        }, {
          expect: call(queryBabyName,
                       sagaArgs,
                       `What is the name you told me previously?`),
        }, {
          provide: oldName,
          expect: call(queryBabyName, sagaArgs),
        }, {
          provide: newName,
          expect: put(renameBaby(id, newName)),
        }, {
          expect: call(sagaArgs.speak,
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
                       sagaArgs,
                       `What is the name you told me previously?`),
        }, {
          provide: `piper`,
          expect: call(sagaArgs.speak,
                       `Sorry, I don't have any baby registered with that name.`,
                       true),
        }, {
          expect: call(queryBabyName,
                       sagaArgs,
                       `What is the name you told me previously?`),
        }, {
          provide: `piper`,
          expect: call(sagaArgs.speak,
                       `Sorry, I don't have any baby registered with that name.`,
                       true),
        }, {
          expect: call(queryBabyName,
                       sagaArgs,
                       `What is the name you told me previously?`),
        }, {
          provide: `piper`,
          expect: call(sagaArgs.speak,
                       `Sorry I'm having trouble. Please try again later.`,
                       true),
        }, {
          done: true,
        },
      ]);
    });

  });

});
