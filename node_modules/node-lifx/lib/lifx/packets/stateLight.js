'use strict';

var utils = require('../../lifx').utils;

var Packet = {
  size: 52
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
    throw new Error('Invalid length given for stateLight LIFX packet');
  }

  obj.color = {};
  obj.color.hue = buf.readUInt16LE(offset);
  offset += 2;
  obj.color.saturation = buf.readUInt16LE(offset);
  offset += 2;
  obj.color.brightness = buf.readUInt16LE(offset);
  offset += 2;
  obj.color.kelvin = buf.readUInt16LE(offset);
  offset += 2;

  obj.dim = buf.readUInt16LE(offset);
  offset += 2;

  obj.power = buf.readUInt16LE(offset);
  offset += 2;

  obj.label = buf.toString('utf8', offset, offset + 32);
  obj.label = obj.label.replace(/\0/g, '');
  offset += 32;

  obj.tags = utils.readUInt64LE(buf, offset);
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

  buf.writeUInt16LE(obj.color.hue, offset);
  offset += 2;
  buf.writeUInt16LE(obj.color.saturation, offset);
  offset += 2;
  buf.writeUInt16LE(obj.color.brightness, offset);
  offset += 2;
  buf.writeUInt16LE(obj.color.kelvin, offset);
  offset += 2;

  buf.writeUInt16LE(obj.dim, offset);
  offset += 2;

  buf.writeUInt16LE(obj.power, offset);
  offset += 2;

  buf.write(obj.label, offset, 32, 'utf8');
  offset += 32;

  utils.writeUInt64LE(buf, offset, obj.tags);
  offset += 8;

  return buf;
};

module.exports = Packet;
