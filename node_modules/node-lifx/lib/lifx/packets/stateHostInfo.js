'use strict';

var Packet = {
  size: 14
};

/**
 * Converts packet specific data from a buffer to an object
 * @param  {Buffer} buf Buffer containing only packet specific data no header
 * @return {Object}     Information contained in packet
 */
Packet.toObject = function(buf) {
  var obj = {};
  var offset = 0;

  // Check length
  if (buf.length !== this.size) {
    throw new Error('Invalid length given for stateHostInfo LIFX packet');
  }

  obj.signal = buf.readFloatLE(offset);
  offset += 4;

  obj.tx = buf.readUInt32LE(offset);
  offset += 4;

  obj.rx = buf.readUInt32LE(offset);
  offset += 4;

  obj.mcuTemperature = buf.readUInt16LE(offset);
  offset += 2;

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

  buf.writeFloatLE(obj.signal, offset);
  offset += 4;

  buf.writeUInt32LE(obj.tx, offset);
  offset += 4;

  buf.writeUInt32LE(obj.rx, offset);
  offset += 4;

  buf.writeUInt16LE(obj.mcuTemperature, offset);
  offset += 2;

  return buf;
};

module.exports = Packet;
