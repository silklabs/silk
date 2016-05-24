'use strict';

var Packet = require('../../../').packet;
var assert = require('chai').assert;

suite('Packet getService', () => {
  suite('create', () => {
    test('general', () => {
      const packet = Packet.create('getService', {}, 'ff2c4807');
      assert.equal(packet.size, 36);
      assert.equal(packet.type, 2);
      assert.equal(packet.source, 'ff2c4807');
      assert.isUndefined(packet.target);
    });
  });
});
