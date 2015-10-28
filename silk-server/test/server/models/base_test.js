/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

import assert from 'assert';
import createContext from '../context';
import Base from '../../../src/server/models/base';
import * as Joi from 'joi';

suite('base model', () => {
  let context = createContext();

  class Sub extends Base {

    static ERROR = {
      foo: 'FOO'
    }

    static INDEX = [
      {
        props: {
          'models.foo': 1
        },
        options: { unique: true }
      }
    ]

    static SCHEMA = {
      model: Joi.object({
        foo: Joi.boolean().required(),
      })
    }

    static COLLECTION = 'sub';
  }

  let subject;
  setup(() => {
    subject = new Sub(context.db);
  });

  test('constructor', () => {
    assert.equal(subject.collection.collectionName, Sub.COLLECTION);
  });

  test('error', () => {
    assert.deepEqual(subject.error('foo'), {
      error: {
        type: 'FOO'
      }
    });
  });

  test('.ensureIndexes', async () => {
    await subject.ensureIndexes();
    let indexes = await subject.collection.getIndexes();
    let last = indexes.pop();
    assert.deepEqual(last.key, { 'models.foo': 1 });
    assert.ok(last.unique, 'is unique');
  });

  test('.validate - valid', () => {
    let valid = subject.validate({ foo: true }, 'model');
    assert.deepEqual(valid, { foo: true });
  });

  test('.validate - valid loose', () => {
    let valid = subject.validate({ foo: true, bar: true }, 'model', false);
    assert.deepEqual(valid, { foo: true, bar: true });
  });

  test('.validate - invalid', () => {
    assert.throws(() => {
      subject.validate({ foo: true, bar: true }, 'model');
    }, /bar/);
  });

  test('.validate - unknown schema', () => {
    assert.throws(() => {
      subject.validate({}, 'futs');
    }, /futs/);
  });
});
