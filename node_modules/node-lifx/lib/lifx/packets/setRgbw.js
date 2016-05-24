'use strict';

var Packet = {
  size: 8
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
    throw new Error('Invalid length given for setRgbw LIFX packet');
  }

  obj.color = {};
  obj.color.red = buf.readUInt16LE(offset);
  offset += 2;
  obj.color.green = buf.readUInt16LE(offset);
  offset += 2;
  obj.color.blue = buf.readUInt16LE(offset);
  offset += 2;
  obj.color.white = buf.readUInt16LE(offset);
  offset += 2;

  return obj;
};

/**
 * Converts the given packet specific object into a packet
 * @param  {Object} obj object with configuration data
 * @param  {Object} obj.color an objects with RGBW colors to set
 * @param  {Number} obj.color.red between 0 and 65535
 * @param  {Number} obj.color.green between 0 and 65535
 * @param  {Number} obj.color.blue between 0 and 65535
 * @param  {Number} obj.color.white between 0 and 65535
 * @return {Buffer} packet
 */
Packet.toBuffer = function(obj) {
  var buf = new Buffer(this.size);
  buf.fill(0);
  var offset = 0;

  if (obj.red === undefined) {
    obj.red = 0;
  }
  if (typeof obj.red !== 'number' && obj.red < 0 || obj.red > 65535) {
    throw new RangeError('Invalid color red given for setRgbw LIFX packet, must be a number between 0 and 65535');
  }
  buf.writeUInt16LE(obj.red, offset);
  offset += 2;

  if (obj.green === undefined) {
    obj.green = 0;
  }
  if (typeof obj.green !== 'number' && obj.green < 0 || obj.green > 65535) {
    throw new RangeError('Invalid color green given for setRgbw LIFX packet, must be a number between 0 and 65535');
  }
  buf.writeUInt16LE(obj.green, offset);
  offset += 2;

  if (obj.blue === undefined) {
    obj.blue = 0;
  }
  if (typeof obj.blue !== 'number' && obj.blue < 0 || obj.blue > 65535) {
    throw new RangeError('Invalid color blue given for setRgbw LIFX packet, must be a number between 0 and 65535');
  }
  buf.writeUInt16LE(obj.blue, offset);
  offset += 2;

  if (obj.white === undefined) {
    obj.white = 0;
  }
  if (typeof obj.white !== 'number' && obj.white < 0 || obj.white > 65535) {
    throw new RangeError('Invalid color white given for setRgbw LIFX packet, must be a number between 0 and 65535');
  }
  buf.writeUInt16LE(obj.white, offset);
  offset += 2;

  return buf;
};

module.exports = Packet;
