'use strict';

var _ = require('lodash');
var constants = require('../../lifx').constants;

var Packet = {
  size: 12
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
    throw new Error('Invalid length given for stateHostFirmware LIFX packet');
  }

  obj.vendorId = buf.readUInt32LE(offset);
  var vendor = _.find(constants.LIFX_VENDOR_IDS, {id: obj.vendorId});
  if (vendor !== undefined) {
    obj.vendorName = vendor.name;
  }
  offset += 4;

  obj.productId = buf.readUInt32LE(offset);
  var product = _.find(constants.LIFX_PRODUCT_IDS, {id: obj.productId});
  if (product !== undefined) {
    obj.productName = product.name;
  }
  offset += 4;

  obj.version = buf.readUInt32LE(offset);
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

  buf.writeUInt32LE(obj.vendor, offset);
  offset += 4;

  buf.writeUInt32LE(obj.product, offset);
  offset += 4;

  buf.writeUInt32LE(obj.version, offset);
  offset += 4;

  return buf;
};

module.exports = Packet;
