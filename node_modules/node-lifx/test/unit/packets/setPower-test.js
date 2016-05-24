'use strict';

var Packet = require('../../../').packet;
var assert = require('chai').assert;

suite('Packet setPower', () => {
  suite('create', () => {
    test('power off', () => {
      const packet = Packet.create('setPower', {level: 0}, 'ff2c4807', 'd073d5006d72');
      assert.equal(packet.size, 42);
      assert.equal(packet.level, 0);
      assert.equal(packet.type, 117);
    });

    test('power on over time', () => {
      const packet = Packet.create('setPower', {level: 65535, duration: 300}, 'ff2c4807', 'd073d5006d72');
      assert.equal(packet.size, 42);
      assert.equal(packet.level, 65535);
      assert.equal(packet.duration, 300);
      assert.equal(packet.type, 117);
    });
  });
});
