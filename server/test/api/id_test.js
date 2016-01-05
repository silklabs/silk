
import assert from 'assert';
import DeviceID from '../../src/api/id';

suite('device id', () => {

  test('.create', () => {
    var id = DeviceID.create();
    assert.equal(typeof id.pub, 'string');
    assert.equal(typeof id.priv, 'string');

    var e = id.export();
    var i = DeviceID.import(e);
    assert.equal(id.pub, i.pub);
    assert.equal(id.priv, i.priv);

    assert.equal(id + '', id.pub);
    assert.equal(id.pub.length, 66);

    assert(id.isValid());

    var signature = id.sign('foo');
    assert(id.verify('foo', signature));
  });

});
