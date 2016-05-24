'use strict';

var constants = require('../../lifx').constants;

var Packet = {
  size: 21
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
    throw new Error('Invalid length given for setWaveform LIFX packet');
  }

  obj.stream = buf.readUInt8(offset);
  offset += 1;

  obj.isTransient = buf.readUInt8(offset);
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

  obj.period = buf.readUInt32LE(offset);
  offset += 4;

  obj.cycles = buf.readFloatLE(offset);
  offset += 4;

  obj.skewRatio = buf.readUInt16LE(offset);
  offset += 2;

  obj.waveform = buf.readUInt8(offset);
  offset += 1;

  return obj;
};

/**
 * Converts the given packet specific object into a packet
 * @param  {Object}  obj object with configuration data
 * @param  {Boolean} obj.isTransient restore color used before effect
 * @param  {Object}  obj.color an objects with colors to set
 * @param  {Number}  obj.color.hue between 0 and 65535
 * @param  {Number}  obj.color.saturation between 0 and 65535
 * @param  {Number}  obj.color.brightness between 0 and 65535
 * @param  {Number}  [obj.color.kelvin=3500] between 2500 and 9000
 * @param  {Number}  obj.period length of one cycle in milliseconds
 * @param  {Number}  obj.cycles how often to repeat through effect
 * @param  {Number}  obj.skewRatio distribution between time on original and new color , positive is for more new color, negative for original color
 * @param  {Number}  obj.waveform between 0 and 4 for form of effect
 * @return {Buffer}  packet
 */
Packet.toBuffer = function(obj) {
  var buf = new Buffer(this.size);
  buf.fill(0);
  var offset = 0;

  // obj.stream field has unknown function so leave it as 0
  offset += 1;

  if (obj.isTransient === undefined) {
    throw new TypeError('obj.isTransient value must be given for setWaveform LIFX packet');
  }
  if (typeof obj.isTransient !== 'boolean') {
    throw new TypeError('Invalid isTransient value given for setWaveform LIFX packet, must be boolean');
  }
  buf.writeUInt8(obj.isTransient, offset);
  offset += 1;

  if (typeof obj.color !== 'object') {
    throw new TypeError('Invalid object for color given for setWaveform LIFX packet');
  }

  if (typeof obj.color.hue !== 'number' && obj.color.hue < 0 || obj.color.hue > 65535) {
    throw new RangeError('Invalid color hue given for setWaveform LIFX packet, must be a number between 0 and 65535');
  }
  buf.writeUInt16LE(obj.color.hue, offset);
  offset += 2;

  if (typeof obj.color.saturation !== 'number' && obj.color.saturation < 0 || obj.color.saturation > 65535) {
    throw new RangeError('Invalid color saturation given for setWaveform LIFX packet, must be a number between 0 and 65535');
  }
  buf.writeUInt16LE(obj.color.saturation, offset);
  offset += 2;

  if (typeof obj.color.brightness !== 'number' && obj.color.brightness < 0 || obj.color.brightness > 65535) {
    throw new RangeError('Invalid color brightness given for setWaveform LIFX packet, must be a number between 0 and 65535');
  }
  buf.writeUInt16LE(obj.color.brightness, offset);
  offset += 2;

  if (obj.color.kelvin === undefined) {
    obj.color.kelvin = constants.HSBK_DEFAULT_KELVIN;
  }
  if (typeof obj.color.kelvin !== 'number' && obj.color.kelvin < 2500 || obj.color.kelvin > 9000) {
    throw new RangeError('Invalid color kelvin given for setWaveform LIFX packet, must be a number between 2500 and 9000');
  }
  buf.writeUInt16LE(obj.color.kelvin, offset);
  offset += 2;

  if (obj.period === undefined) {
    throw new TypeError('obj.period value must be given for setWaveform LIFX packet');
  }
  if (typeof obj.period !== 'number') {
    throw new TypeError('Invalid period type given for setWaveform LIFX packet, must be a number');
  }
  buf.writeUInt32LE(obj.period, offset);
  offset += 4;

  if (obj.cycles === undefined) {
    throw new TypeError('obj.cycles value must be given for setWaveform LIFX packet');
  }
  if (typeof obj.cycles !== 'number') {
    throw new TypeError('Invalid cycles type given for setWaveform LIFX packet, must be a number');
  }
  buf.writeFloatLE(obj.cycles, offset);
  offset += 4;

  if (obj.skewRatio === undefined) {
    throw new TypeError('obj.skewRatio value must be given for setWaveform LIFX packet');
  }
  if (typeof obj.skewRatio !== 'number') {
    throw new TypeError('Invalid skewRatio type given for setWaveform LIFX packet, must be a number');
  }
  buf.writeInt16LE(obj.skewRatio, offset);
  offset += 2;

  if (obj.waveform === undefined) {
    throw new TypeError('obj.waveform value must be given for setWaveform LIFX packet');
  }
  if (typeof obj.waveform !== 'number' && obj.waveform < 0 || obj.waveform > (constants.LIGHT_WAVEFORMS.length - 1)) {
    throw new RangeError('Invalid waveform value given for setWaveform LIFX packet, must be a number between 0 and ' + (constants.LIGHT_WAVEFORMS.length - 1));
  }
  buf.writeUInt8(obj.waveform, offset);
  offset += 1;

  return buf;
};

module.exports = Packet;
