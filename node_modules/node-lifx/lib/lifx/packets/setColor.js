'use strict';

var constants = require('../../lifx').constants;

var Packet = {
  size: 13
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
    throw new Error('Invalid length given for setColor LIFX packet');
  }

  obj.stream = buf.readUInt8(offset);
  offset += 1;

  obj.color = {};
  obj.color.hue = buf.readUInt16LE(offset);
  offset += 2;
  obj.color.saturation = buf.readUInt16LE(offset);
  offset += 2;
  obj.color.brightness = buf.readUInt16LE(offset);
  offset += 2;
  obj.color.kelvin = buf.readUInt16LE(offset);
  offset += 2;

  obj.duration = buf.readUInt32LE(offset);
  offset += 4;

  return obj;
};

/**
 * Converts the given packet specific object into a packet
 * @param  {Object} obj object with configuration data
 * @param  {Object} obj.color an objects with colors to set
 * @param  {Number} obj.color.hue between 0 and 65535
 * @param  {Number} obj.color.saturation between 0 and 65535
 * @param  {Number} obj.color.brightness between 0 and 65535
 * @param  {Number} obj.color.kelvin between 2500 and 9000
 * @param  {Number} [obj.duration] transition time in milliseconds
 * @return {Buffer} packet
 */
Packet.toBuffer = function(obj) {
  var buf = new Buffer(this.size);
  buf.fill(0);
  var offset = 0;

  // obj.stream field has unknown function so leave it as 0
  offset += 1;

  if (typeof obj.hue !== 'number' && obj.hue < 0 || obj.hue > 65535) {
    throw new RangeError('Invalid color hue given for setColor LIFX packet, must be a number between 0 and 65535');
  }
  buf.writeUInt16LE(obj.hue, offset);
  offset += 2;

  if (typeof obj.saturation !== 'number' && obj.saturation < 0 || obj.saturation > 65535) {
    throw new RangeError('Invalid color saturation given for setColor LIFX packet, must be a number between 0 and 65535');
  }
  buf.writeUInt16LE(obj.saturation, offset);
  offset += 2;

  if (typeof obj.brightness !== 'number' && obj.brightness < 0 || obj.brightness > 65535) {
    throw new RangeError('Invalid color brightness given for setColor LIFX packet, must be a number between 0 and 65535');
  }
  buf.writeUInt16LE(obj.brightness, offset);
  offset += 2;

  if (obj.kelvin === undefined) {
    obj.kelvin = constants.HSBK_DEFAULT_KELVIN;
  }
  if (typeof obj.kelvin !== 'number' && obj.kelvin < 2500 || obj.kelvin > 9000) {
    throw new RangeError('Invalid color kelvin given for setColor LIFX packet, must be a number between 2500 and 9000');
  }
  buf.writeUInt16LE(obj.kelvin, offset);
  offset += 2;

  // Duration is 0 by default
  if (obj.duration !== undefined) {
    buf.writeUInt32LE(obj.duration, offset);
  }
  offset += 4;

  return buf;
};

module.exports = Packet;
