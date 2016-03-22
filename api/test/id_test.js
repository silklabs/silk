
import assert from 'assert';
import DeviceID from '../src/access_token';

suite('device id', () => {

  test('.create', () => {
    const id = DeviceID.create();
    assert.equal(typeof id.pub, 'string');
    assert.equal(typeof id.priv, 'string');

    const e = id.export();
    const i = DeviceID.import(e);
    assert.equal(id.pub, i.pub);
    assert.equal(id.priv, i.priv);

    assert.equal(id + '', id.pub);
    assert.equal(id.pub.length, 64);

    assert(id.isValid());

    const signature = id.sign('foo');
    assert(id.verify('foo', signature));
  });

});
