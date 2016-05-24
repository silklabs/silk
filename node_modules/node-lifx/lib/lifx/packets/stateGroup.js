'use strict';

var utils = require('../../lifx').utils;

var Packet = {
  size: 56
};

/**
 * Converts packet specific data from a buffer to an object
 * @param  {Buffer} buf Buffer containing only packet specific data no header
 * @return {Object}     Information contained in packet
 */
Packet.toObject = function(buf) {
  var obj = {};
  var offset = 0;

  if (buf.length !== this.size) {
    throw new Error('Invalid length given for stateGroup LIFX packet');
  }

  obj.group = buf.toString('hex', offset, offset + 16);
  offset += 16;

  obj.label = buf.toString('utf8', offset, offset + 32);
  obj.label = obj.label.replace(/\0/g, '');
  offset += 32;

  obj.updatedAt = utils.readUInt64LE(buf, offset);
  offset += 8;

  return obj;
};

/**
 * Converts the given packet specific object into a packet
 * @param  {Object} obj object with configuration data
 * @return {Buffer}     packet
 */
Packet.toBuffer = function(obj) {
  var buf = new Buffer(this.size);
  buf.fill(0);
  var offset = 0;

  buf.write(obj.group, offset, 16, 'hex');
  offset += 16;

  buf.write(obj.label, offset, 32, 'utf8');
  offset += 32;

  utils.writeUInt64LE(buf, offset, obj.updatedAt);
  offset += 8;

  return buf;
};

module.exports = Packet;
