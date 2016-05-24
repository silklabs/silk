'use strict';

var constants = require('../lifx').constants;
var packets = require('./packets');
var utils = require('../lifx').utils;
var _ = require('lodash');

/*
  Package headers 36 bit in total consisting of
  size - 2 bit
  frameDescription - 2 bit

  source - 4 bit
  target - 6 bit
  00 00 -
  site - 6 bit

  frameAddressDescription - 1 bit
  sequence - 1 bit
  time - 8 bit
  type - 2 bit
  00 00
 */
var Packet = {};

/**
 * Mapping for types
 * @type {Array}
 */
Packet.typeList = [
  {id: 2, name: 'getService'},
  {id: 3, name: 'stateService'},
  {id: 12, name: 'getHostInfo'},
  {id: 13, name: 'stateHostInfo'},
  {id: 14, name: 'getHostFirmware'},
  {id: 15, name: 'stateHostFirmware'},
  {id: 16, name: 'getWifiInfo'},
  {id: 17, name: 'stateWifiInfo'},
  {id: 18, name: 'getWifiFirmware'},
  {id: 19, name: 'stateWifiFirmware'},
  // {id: 20, name: 'getPower'}, // These are for device level
  // {id: 21, name: 'setPower'}, // and do not support duration value
  // {id: 22, name: 'statePower'}, // since that we don't use them
  {id: 23, name: 'getLabel'},
  {id: 24, name: 'setLabel'},
  {id: 25, name: 'stateLabel'},
  {id: 32, name: 'getVersion'},
  {id: 33, name: 'stateVersion'},
  {id: 45, name: 'acknowledgement'},
  {id: 48, name: 'getLocation'},
  {id: 50, name: 'stateLocation'},
  {id: 51, name: 'getGroup'},
  {id: 53, name: 'stateGroup'},
  {id: 54, name: 'getOwner'},
  {id: 56, name: 'stateOwner'},
  {id: 58, name: 'echoRequest'},
  {id: 59, name: 'echoResponse'},
  {id: 69, name: 'getTemperature'},
  {id: 70, name: 'stateTemperature'},
  {id: 101, name: 'getLight'},
  {id: 102, name: 'setColor'},
  {id: 103, name: 'setWaveform'},
  {id: 107, name: 'stateLight'},
  {id: 111, name: 'stateTemperature'},
  // {id: 113, name: 'setSimpleEvent'},
  // {id: 114, name: 'getSimpleEvent'},
  // {id: 115, name: 'stateSimpleEvent'},
  {id: 116, name: 'getPower'},
  {id: 117, name: 'setPower'},
  {id: 118, name: 'statePower'},
  // {id: 119, name: 'setWaveformOptional'},
  {id: 401, name: 'getAmbientLight'},
  {id: 402, name: 'stateAmbientLight'}
  // {id: 403, name: 'getDimmerVoltage'},
  // {id: 404, name: 'stateDimmerVoltage'}
];

/**
 * Parses a lifx packet header
 * @param {Buffer} buf Buffer containg lifx packet including header
 * @return {Object} parsed packet header
 */
Packet.headerToObject = function(buf) {
  var obj = {};
  var offset = 0;

  // Frame
  obj.size = buf.readUInt16LE(offset);
  offset += 2;

  var frameDescription = buf.readUInt16LE(offset);
  obj.addressable = (frameDescription & constants.ADDRESSABLE_BIT) !== 0;
  obj.tagged = (frameDescription & constants.TAGGED_BIT) !== 0;
  obj.origin = ((frameDescription & constants.ORIGIN_BITS) >> 14) !== 0;
  obj.protocolVersion = (frameDescription & constants.PROTOCOL_VERSION_BITS);
  offset += 2;

  obj.source = buf.toString('hex', offset, offset + 4);
  offset += 4;

  // Frame address
  obj.target = buf.toString('hex', offset, offset + 6);
  offset += 6;

  obj.reserved1 = buf.slice(offset, offset + 2);
  offset += 2;

  obj.site = buf.toString('utf8', offset, offset + 6);
  obj.site = obj.site.replace(/\0/g, '');
  offset += 6;

  var frameAddressDescription = buf.readUInt8(offset);
  obj.ackRequired = (frameAddressDescription & constants.ACK_REQUIRED_BIT) !== 0;
  obj.resRequired = (frameAddressDescription & constants.RESPONSE_REQUIRED_BIT) !== 0;
  offset += 1;

  obj.sequence = buf.readUInt8(offset);
  offset += 1;

  // Protocol header
  obj.time = utils.readUInt64LE(buf, offset);
  offset += 8;

  obj.type = buf.readUInt16LE(offset);
  offset += 2;

  obj.reserved2 = buf.slice(offset, offset + 2);
  offset += 2;

  return obj;
};

/**
 * Parses a lifx packet
 * @param {Buffer} buf Buffer with lifx packet
 * @return {Object} parsed packet
 */
Packet.toObject = function(buf) {
  var obj = {};

  obj = this.headerToObject(buf);

  if (obj.type !== undefined) {
    var typeName = _.result(_.find(this.typeList, {id: obj.type}), 'name');
    if (packets[typeName] !== undefined) {
      if (typeof packets[typeName].toObject === 'function') {
        var specificObj = packets[typeName].toObject(buf.slice(constants.PACKET_HEADER_SIZE));
        obj = _.extend(obj, specificObj);
      }
    }
  }

  return obj;
};

/**
 * Creates a lifx packet header from a given object
 * @param {Object} obj Object containg header configuration for packet
 * @return {Buffer} packet header buffer
 */
Packet.headerToBuffer = function(obj) {
  var buf = new Buffer(36);
  buf.fill(0);
  var offset = 0;

  // Frame
  buf.writeUInt16LE(obj.size, offset);
  offset += 2;

  if (obj.protocolVersion === undefined) {
    obj.protocolVersion = constants.PROTOCOL_VERSION_CURRENT;
  }
  var frameDescription = obj.protocolVersion;

  if (obj.addressable !== undefined && obj.addressable === true) {
    frameDescription |= constants.ADDRESSABLE_BIT;
  } else if (obj.source !== undefined && obj.source.length > 0 && obj.source !== '00000000') {
    frameDescription |= constants.ADDRESSABLE_BIT;
  }

  if (obj.tagged !== undefined && obj.tagged === true) {
    frameDescription |= constants.TAGGED_BIT;
  }

  if (obj.origin !== undefined && obj.origin === true) {
    // 0 or 1 to the 14 bit
    frameDescription |= (1 << 14);
  }

  buf.writeUInt16LE(frameDescription, offset);
  offset += 2;

  if (obj.source !== undefined && obj.source.length > 0) {
    if (obj.source.length === 8) {
      buf.write(obj.source, offset, 4, 'hex');
    } else {
      throw new RangeError('LIFX source must be given in 8 characters');
    }
  }
  offset += 4;

  // Frame address
  if (obj.target !== undefined && obj.target !== null) {
    buf.write(obj.target, offset, 6, 'hex');
  }
  offset += 6;

  // reserved1
  offset += 2;

  if (obj.site !== undefined && obj.site !== null) {
    buf.write(obj.site, offset, 6, 'utf8');
  }
  offset += 6;

  var frameAddressDescription = 0;
  if (obj.ackRequired !== undefined && obj.ackRequired === true) {
    frameAddressDescription |= constants.ACK_REQUIRED_BIT;
  }

  if (obj.resRequired !== undefined && obj.resRequired === true) {
    frameAddressDescription |= constants.RESPONSE_REQUIRED_BIT;
  }
  buf.writeUInt8(frameAddressDescription, offset);
  offset += 1;

  if (typeof obj.sequence === 'number') {
    buf.writeUInt8(obj.sequence, offset);
  }
  offset += 1;

  // Protocol header
  if (obj.time !== undefined) {
    utils.writeUInt64LE(buf, offset, obj.time);
  }
  offset += 8;

  if (typeof obj.type === 'number') {
    obj.type = _.result(_.find(this.typeList, {id: obj.type}), 'id');
  } else if (typeof obj.type === 'string' || obj.type instanceof String) {
    obj.type = _.result(_.find(this.typeList, {name: obj.type}), 'id');
  }
  if (obj.type === undefined) {
    throw new Error('Unknown lifx packet of type: ' + obj.type);
  }
  buf.writeUInt16LE(obj.type, offset);
  offset += 2;

  // reserved2
  offset += 2;

  return buf;
};

/**
 * Creates a packet from a configuration object
 * @param {Object} obj Object with configuration for packet
 * @return {Buffer|Boolean} the packet or false in case of error
 */
Packet.toBuffer = function(obj) {
  if (obj.type !== undefined) {
    // Map id to string if needed
    if (typeof obj.type === 'number') {
      obj.type = _.result(_.find(this.typeList, {id: obj.type}), 'name');
    } else if (typeof obj.type === 'string' || obj.type instanceof String) {
      obj.type = _.result(_.find(this.typeList, {name: obj.type}), 'name');
    }

    if (obj.type !== undefined) {
      if (typeof packets[obj.type].toBuffer === 'function') {
        var packetTypeData = packets[obj.type].toBuffer(obj);
        return Buffer.concat([
          this.headerToBuffer(obj),
          packetTypeData
        ]);
      }
      return this.headerToBuffer(obj);
    }
  }

  return false;
};

/**
 * Creates a new packet by the given type
 * Note: This does not validate the given params
 * @param  {String|Number} type the type of packet to create as number or string
 * @param  {Object} params further settings to pass
 * @param  {String} [source] the source of the packet, length 8
 * @param  {String} [target] the target of the packet, length 12
 * @return {Object} The prepared packet object including header
 */
Packet.create = function(type, params, source, target) {
  var obj = {};
  if (type !== undefined) {
    // Check if type is valid
    if (typeof type === 'string' || type instanceof String) {
      obj.type = _.result(_.find(this.typeList, {name: type}), 'id');
    } else if (typeof type === 'number') {
      var typeMatch = _.find(this.typeList, {id: type});
      obj.type = _.result(typeMatch, 'id');
      type = _.result(typeMatch, 'name');
    }
    if (obj.type === undefined) {
      return false;
    }
  } else {
    return false;
  }
  obj.size = constants.PACKET_HEADER_SIZE + packets[type].size;

  if (source !== undefined) {
    obj.source = source;
  }
  if (target !== undefined) {
    obj.target = target;
  }
  if (packets[type].tagged !== undefined) {
    obj.tagged = packets[type].tagged;
  }

  return _.assign(obj, params);
};

module.exports = Packet;
