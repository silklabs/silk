'use strict';

var Packet = require('../../').packet;
var assert = require('chai').assert;

suite('Packet', () => {
  test('header to object', () => {
    let msg = new Buffer('240000343e80510800000000000000000000000000000000000000000000000002000000', 'hex');
    let parsed = Packet.headerToObject(msg);

    assert.isObject(parsed);
    assert.equal(parsed.size, 36);
    assert.equal(parsed.addressable, true);
    assert.equal(parsed.tagged, true);
    assert.equal(parsed.origin, false);
    assert.equal(parsed.protocolVersion, 1024);
    assert.equal(parsed.source, '3e805108');
    assert.equal(parsed.target, '000000000000');
    assert.equal(parsed.ackRequired, false);
    assert.equal(parsed.resRequired, false);
    assert.equal(parsed.site, '');
    assert.equal(parsed.type, 2);
    assert.equal(parsed.sequence, 0);
    assert.isTrue(parsed.time.equals(new Buffer('0000000000000000', 'hex')));
    assert.isTrue(parsed.reserved1.equals(new Buffer('0000', 'hex')));
    assert.isTrue(parsed.reserved2.equals(new Buffer('0000', 'hex')));

    msg = new Buffer('3200005442524b52d073d5006d7200004c49465856320000c466acd1741bdf13110000001ddb86343fe90100e61701000000', 'hex');
    parsed = Packet.headerToObject(msg);

    assert.isObject(parsed);
    assert.equal(parsed.size, 50);
    assert.equal(parsed.addressable, true);
    assert.equal(parsed.tagged, false);
    assert.equal(parsed.origin, true);
    assert.equal(parsed.protocolVersion, 1024);
    assert.equal(parsed.source, '42524b52');
    assert.equal(parsed.target, 'd073d5006d72');
    assert.equal(parsed.ackRequired, false);
    assert.equal(parsed.resRequired, false);
    assert.equal(parsed.site, 'LIFXV2');
    assert.equal(parsed.sequence, 0);
    assert.equal(parsed.type, 17);
    assert.isTrue(parsed.time.equals(new Buffer('c466acd1741bdf13', 'hex')));
    assert.isTrue(parsed.reserved1.equals(new Buffer('0000', 'hex')));
    assert.isTrue(parsed.reserved2.equals(new Buffer('0000', 'hex')));

    msg = new Buffer('5c00005442524b52d073d5006d7200004c49465856320000c469ea095c6adf13380000001438456c47c442a9b2603b45972218170000000000000000000000000000000000000000000000000000000000000000406e62fc12f4b913', 'hex');
    parsed = Packet.headerToObject(msg);

    assert.isObject(parsed);
    assert.equal(parsed.size, 92);
    assert.equal(parsed.addressable, true);
    assert.equal(parsed.tagged, false);
    assert.equal(parsed.origin, true);
    assert.equal(parsed.protocolVersion, 1024);
    assert.equal(parsed.source, '42524b52');
    assert.equal(parsed.target, 'd073d5006d72');
    assert.equal(parsed.ackRequired, false);
    assert.equal(parsed.resRequired, false);
    assert.equal(parsed.site, 'LIFXV2');
    assert.equal(parsed.sequence, 0);
    assert.equal(parsed.type, 56);
    assert.isTrue(parsed.time.equals(new Buffer('c469ea095c6adf13', 'hex')));
    assert.isTrue(parsed.reserved1.equals(new Buffer('0000', 'hex')));
    assert.isTrue(parsed.reserved2.equals(new Buffer('0000', 'hex')));

    msg = new Buffer('24000014953C1B08D073D5006D7200004C49465856320007000000000000000033000000', 'hex');
    parsed = Packet.headerToObject(msg);

    assert.isObject(parsed);
    assert.equal(parsed.size, 36);
    assert.equal(parsed.addressable, true);
    assert.equal(parsed.tagged, false);
    assert.equal(parsed.origin, false);
    assert.equal(parsed.protocolVersion, 1024);
    assert.equal(parsed.source, '953c1b08');
    assert.equal(parsed.target, 'd073d5006d72');
    assert.equal(parsed.ackRequired, false);
    assert.equal(parsed.resRequired, false);
    assert.equal(parsed.site, 'LIFXV2');
    assert.equal(parsed.sequence, 7);
    assert.equal(parsed.type, 51);
    assert.isTrue(parsed.time.equals(new Buffer('0000000000000000', 'hex')));
    assert.isTrue(parsed.reserved1.equals(new Buffer('0000', 'hex')));
    assert.isTrue(parsed.reserved2.equals(new Buffer('0000', 'hex')));
  });

  test('header to buffer', () => {
    let expectedResult;

    expectedResult = new Buffer('240000343e80510800000000000000000000000000000000000000000000000002000000', 'hex');
    let obj = {
      size: 36,
      tagged: true,
      protocolVersion: 1024,
      source: '3e805108',
      type: 2,
      sequence: 0
    };
    let parsed = Packet.headerToBuffer(obj);
    assert.isTrue(parsed.equals(expectedResult));

    assert.throw(() => {
      obj = {
        size: 36,
        tagged: true,
        protocolVersion: 1024,
        source: '3e80510',
        type: 2
      };
      parsed = Packet.headerToBuffer(obj);
    }, RangeError);

    assert.throw(() => {
      obj = {
        size: 36,
        tagged: true,
        protocolVersion: 1024,
        source: '3e805108',
        type: 'unkownType'
      };
      parsed = Packet.headerToBuffer(obj);
    }, Error);

    expectedResult = new Buffer('5c00005442524b52d073d5006d7200004c49465856320000c469ea095c6adf1338000000', 'hex');
    obj = {
      size: 92,
      origin: true,
      source: '42524b52',
      target: 'd073d5006d72',
      site: 'LIFXV2',
      sequence: 0,
      type: 'stateOwner',
      time: new Buffer('c469ea095c6adf13', 'hex'),
      owner: '1438456c47c442a9b2603b4597221817',
      label: '',
      updatedAt: '1421435519793000000' // Should not be written
    };

    parsed = Packet.headerToBuffer(obj);
    assert.isTrue(parsed.equals(expectedResult));
  });

  test('package creation', () => {
    let genPacket = Packet.create('getService', {}, '42524b52', 'd073d5006d72');
    assert.isObject(genPacket);
    assert.equal(genPacket.type, 2);
    assert.equal(genPacket.size, 36);
    assert.equal(genPacket.tagged, true);
    assert.equal(genPacket.source, '42524b52');
    assert.equal(genPacket.target, 'd073d5006d72');

    genPacket = Packet.create(2, {}, '42524b52', 'd073d5006d72');
    assert.isObject(genPacket);
    assert.equal(genPacket.type, 2);
    assert.equal(genPacket.size, 36);
    assert.equal(genPacket.tagged, true);
    assert.equal(genPacket.source, '42524b52');
    assert.equal(genPacket.target, 'd073d5006d72');
  });
});
