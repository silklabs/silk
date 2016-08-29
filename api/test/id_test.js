/**
 * @flow
 */

import assert from 'assert';
import DeviceID from '../src/access_token';

suite('device id', () => {

  test('.create', async () => {
    const id = await DeviceID.gen();
    assert.equal(typeof id.pub, 'string');
    assert.equal(typeof id.priv, 'string');

    const e = id.export();
    const i = DeviceID.import(e);
    assert.equal(id.pub, i.pub);
    assert.equal(id.priv, i.priv);

    assert.equal(id + '', id.pub);
    assert.equal(id.pub.length, 64);

    assert(await id.genIsValid());

    const signature = await id.genSign('foo');
    assert(await id.genVerify('foo', signature));
  });

});
