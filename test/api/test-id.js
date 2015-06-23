/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

var DeviceID = require('../../api').id;

exports.test = function (test) {
  test.expect(8);

  var id = DeviceID.create();
  test.equal(typeof id.pub, "string");
  test.equal(typeof id.priv, "string");

  var e = id.export();
  var i = DeviceID.import(e);
  test.equal(id.pub, i.pub);
  test.equal(id.priv, i.priv);

  test.equal(id + "", id.pub);
  test.equal(id.pub.length, 66);

  test.ok(id.isValid());

  var signature = id.sign("foo");
  test.ok(id.verify("foo", signature));

  test.done();
}

