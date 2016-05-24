'use strict';

module.exports = {
  // Ports used by LIFX
  LIFX_DEFAULT_PORT: 56700,
  LIFX_ANY_PORT: 56800,

  // Masks for packet description in packet header
  ADDRESSABLE_BIT: 0x1000,
  TAGGED_BIT: 0x2000,
  ORIGIN_BITS: 0xC000,
  PROTOCOL_VERSION_BITS: 0xFFF,

  // Masks for response types in packet header
  RESPONSE_REQUIRED_BIT: 0x1,
  ACK_REQUIRED_BIT: 0x2,

  // Protocol version mappings
  PROTOCOL_VERSION_CURRENT: 1024,
  PROTOCOL_VERSION_1: 1024,

  MESSAGE_RATE_LIMIT: 50, // in ms
  DISCOVERY_INTERVAL: 5000, // in ms

  // Packet headers
  PACKET_HEADER_SIZE: 36,
  PACKET_HEADER_SEQUENCE_MAX: 255, // 8 bit

  // HSBK value calculation
  HSBK_MINIMUM_KELVIN: 2500,
  HSBK_DEFAULT_KELVIN: 3500,
  HSBK_MAXIMUM_KELVIN: 9000,
  HSBK_MINIMUM_BRIGHTNESS: 0,
  HSBK_MAXIMUM_BRIGHTNESS: 100,
  HSBK_MINIMUM_SATURATION: 0,
  HSBK_MAXIMUM_SATURATION: 100,
  HSBK_MINIMUM_HUE: 0,
  HSBK_MAXIMUM_HUE: 360,

  // Vendor ID values
  LIFX_VENDOR_IDS: [
    {id: 1, name: 'LIFX'}
  ],

  // Product ID values
  LIFX_PRODUCT_IDS: [
    {id: 1, name: 'Original 1000'},
    {id: 3, name: 'Color 650'},
    {id: 10, name: 'White 800 (Low Voltage)'},
    {id: 11, name: 'White 800 (High Voltage)'},
    {id: 18, name: 'White 900 BR30 (Low Voltage)'},
    {id: 19, name: 'White 900 BR30 (High Voltage)'},
    {id: 20, name: 'Color 900 BR30'},
    {id: 22, name: 'Color 1000'}
  ],

  // Waveform values, order is important here
  LIGHT_WAVEFORMS: [
    'SAW',
    'SINE',
    'HALF_SINE',
    'TRIANGLE',
    'PULSE'
  ],

  // Packet types used by internal sending process
  PACKET_TRANSACTION_TYPES: {
    ONE_WAY: 0,
    REQUEST_RESPONSE: 1
  }
};
