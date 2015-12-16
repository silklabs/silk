/* @flow */

import assert from 'assert';
import {
  Float,
  Integer,
  default as BaseMetric,
} from '../src/metric';

suite('metrics', function() {

  suite('number types', function() {
    [
      { type: Float, input: 1, expected: '1.0' },
      { type: Float, input: 1007.77, expected: '1007.77' },
      { type: Float, input: 100.0, expected: '100.0' },
      { type: Integer, input: 1.00, expected: '1' },
      { type: Integer, input: 0.00, expected: '0' },
      { type: Integer, input: 10007, expected: '10007' },
    ].forEach((values) => {
      let {type, input, expected} = values;
      test(`${input} as ${type.name} should stirngify to ${expected}`, () => {
        let instance = new type(input); // eslint-disable-line new-cap
        assert.strictEqual(instance.toString(), expected);
      });
    });
  });

  test('metric', async () => {
    type MyType = {
      foo: string;
      bar: string;
      float: Float;
      int: Integer;
      bool: bool;
    };

    class MyFoo extends BaseMetric {
      static NAME = 'foo';
      static INDEX = new Set(['foo']);
      static DESC = 'Testing only...';

      properties: MyType;

      constructor(props: MyType) {
        super(props);
      }
    }

    let instance = new MyFoo({
      foo: ', wow =',
      bar: 'string',
      int: new Integer(1),
      float: new Float(1),
      bool: true
    });

    assert.deepEqual(instance.toJSON(), [
      instance.constructor.NAME,
      { foo: `\\,\\ wow\\ \\=` },
      {
        bar: `"string"`,
        int: '1i',
        float: '1.0',
        bool: 'true'
      }
    ]);
  });

});
