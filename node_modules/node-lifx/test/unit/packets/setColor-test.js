'use strict';

var Packet = require('../../../').packet;
var assert = require('chai').assert;

suite('Packet setColor', () => {
  suite('create', () => {
    test('valid colors', () => {
      let packet;
      packet = Packet.create('setColor', {
        hue: 5686,
        saturation: 13106,
        brightness: 65535,
        kelvin: 3500
      }, 'ff2c4807', 'd073d5006d72');
      assert.equal(packet.size, 49);
      assert.equal(packet.hue, 5686);
      assert.equal(packet.saturation, 13106);
      assert.equal(packet.brightness, 65535);
      assert.equal(packet.kelvin, 3500);
      assert.equal(packet.type, 102);

      packet = Packet.create('setColor', {
        hue: 62351,
        saturation: 13106,
        brightness: 65535,
        kelvin: 3500,
        duration: 1300
      }, 'ff2c4807', 'd073d5006d72');
      assert.equal(packet.size, 49);
      assert.equal(packet.hue, 62351);
      assert.equal(packet.saturation, 13106);
      assert.equal(packet.brightness, 65535);
      assert.equal(packet.kelvin, 3500);
      assert.equal(packet.duration, 1300);
      assert.equal(packet.type, 102);
    });

    test('invalid colors', () => {
      assert.throw(() => {
        var obj = Packet.create('setColor', {
          hue: 0,
          saturation: 0,
          brightness: 0,
          kelvin: 9001
        }, 'ff2c4807', 'd073d5006d72');
        Packet.toBuffer(obj);
      }, RangeError);

      assert.throw(() => {
        var obj = Packet.create('setColor', {
          hue: 0,
          saturation: 0,
          brightness: 65536,
          kelvin: 4000
        }, 'ff2c4807', 'd073d5006d72');
        Packet.toBuffer(obj);
      }, RangeError);

      assert.throw(() => {
        var obj = Packet.create('setColor', {
          hue: 0,
          saturation: 65536,
          brightness: 0,
          kelvin: 2500
        }, 'ff2c4807', 'd073d5006d72');
        Packet.toBuffer(obj);
      }, RangeError);

      assert.throw(() => {
        var obj = Packet.create('setColor', {
          hue: 65536,
          saturation: 0,
          brightness: 0,
          kelvin: 2500
        }, 'ff2c4807', 'd073d5006d72');
        Packet.toBuffer(obj);
      }, RangeError);
    });
  });
});
