'use strict';

var os = require('os');
var utils = exports;

/**
 * Return all ip addresses of the machine
 * @return {Array} list containing ip address info
 */
utils.getHostIPs = function() {
  var ips = [];
  var ifaces = os.networkInterfaces();
  Object.keys(ifaces).forEach(function(ifname) {
    ifaces[ifname].forEach(function(iface) {
      ips.push(iface.address);
    });
  });
  return ips;
};

/**
 * Generates a random hex string of the given length
 * @example
 * // returns something like 8AF1
 * utils.getRandomHexString(4)
 * @example
 * // returns something like 0D41C8AF
 * utils.getRandomHexString()
 * @param  {Number} [length=8] string length to generate
 * @return {String}            random hex string
 */
utils.getRandomHexString = function(length) {
  var string = '';
  var chars = '0123456789ABCDEF';

  if (!length) {
    length = 8;
  }

  for (var i = 0; i < length; i++) {
    var randomNumber = Math.floor(Math.random() * chars.length);
    string += chars.substring(randomNumber, randomNumber + 1);
  }

  return string;
};

/**
 * Reads a little-endian unsigned 64-bit value and returns it as buffer
 * This function exists for easy replacing if a native method will be provided
 * by node.js and does not make sense like is
 * @param  {Buffer} buffer buffer to read from
 * @param  {Number} offset offset to begin reading from
 * @return {Buffer}        resulting 64-bit buffer
 */
utils.readUInt64LE = function(buffer, offset) {
  return buffer.slice(offset, offset + 8);
};

/**
 * Writes a 64-bit value provided as buffer and returns the result
 * This function exists for easy replacing if a native method will be provided
 * by node.js and does not make sense like is
 * @param  {Buffer} buffer buffer to write from
 * @param  {Number} offset offset to begin reading from
 * @param  {Buffer} input  the buffer to write
 * @return {Buffer}        resulting 64-bit buffer
 */
utils.writeUInt64LE = function(buffer, offset, input) {
  return input.copy(buffer, offset, 0, 8);
};
