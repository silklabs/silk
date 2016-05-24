'use strict';

var Packet = {
  size: 5
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
    throw new Error('Invalid length given for stateService LIFX packet');
  }

  obj.service = buf.readUInt8(offset);
  offset += 1;

  /*
    Map service to a value
    -------------
    UDP -> 1
    reserved -> 2
    reserved -> 3
    reserved -> 4
  */
  if (obj.service === 1) {
    obj.service = 'udp';
  } else if (obj.service >= 2 && obj.service <= 4) {
    obj.serice = 'reserved';
  } else {
    obj.serice = 'unknown';
  }

  obj.port = buf.readUInt32LE(offset);
  offset += 4;

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

  buf.writeUInt8(obj.service, offset);
  offset += 1;

  buf.writeUInt32LE(obj.port, offset);
  offset += 4;

  return buf;
};

module.exports = Packet;
