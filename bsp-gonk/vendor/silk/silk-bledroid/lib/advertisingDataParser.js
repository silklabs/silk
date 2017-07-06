/**
 * @noflow
 * @private
 */

import invariant from 'assert';
import makeLog from 'silk-log';
import uuid from 'uuid';

const log = makeLog('bledroid:adp');

function reverseBuffer(buffer) {
  const length = buffer.length;
  let reversed = new Buffer(length);
  for (let i = 0; i < length; i++) {
    reversed[i] = buffer[length - i - 1];
  }
  return reversed;
}

function bufferToString(buffer) {
  if (!buffer.length) {
    log.info('Empty buffer calling bufferToString()');
    return undefined;
  }
  return buffer.toString('utf8');
}

function bufferToHexString(buffer) {
  if (!buffer.length) {
    log.info('Empty buffer calling bufferToHexString()');
    return undefined;
  }
  return buffer.toString('hex');
}

function bufferToInt8(buffer) {
  if (!buffer.length) {
    log.info('Empty buffer calling bufferToInt8()');
    return undefined;
  }
  return buffer.readInt8(0, /* noAssert */ true);
}

function bufferToUUID(uuidLength, buffer) {
  if (uuidLength !== 16 && uuidLength !== 4 && uuidLength !== 2) {
    throw new Error(`Unsupported length: ${uuidLength}`);
  }

  if (!buffer.length) {
    log.info('Empty buffer calling bufferToUUID()');
    return undefined;
  }

  if (buffer.length < uuidLength) {
    log.info('Incomplete buffer calling bufferToUUID()');
    return undefined;
  }

  if (buffer.length > uuidLength) {
    buffer = buffer.slice(0, uuidLength);
  }

  buffer = reverseBuffer(buffer);

  let uuidString;
  if (uuidLength === 16) {
    uuidString = uuid.unparse(buffer).toLowerCase();
  } else {
    uuidString = bufferToHexString(buffer);
  }
  invariant(typeof uuidString === 'string');

  if (uuidString.length !== 36 &&
      uuidString.length !== 8 &&
      uuidString.length !== 4) {
    log.info(`Constructed an invalid uuid: '${uuidString}'`);
    return undefined;
  }

  return uuidString;
}

function bufferToUUIDArray(uuidLength, buffer) {
  if (uuidLength !== 16 && uuidLength !== 4 && uuidLength !== 2) {
    throw new Error(`Unsupported length: ${uuidLength}`);
  }

  if (!buffer.length) {
    log.info('Empty buffer calling bufferToUUIDArray()');
    return undefined;
  }

  if (buffer.length < uuidLength) {
    log.info('Incomplete buffer calling bufferToUUIDArray()');
    return undefined;
  }

  if (buffer.length % uuidLength) {
    log.info(`Buffer is not an even multiple of ${uuidLength}-lengh uuids`);
    return undefined;
  }

  let uuids = [];

  for (let offset = 0; offset < buffer.length; offset += uuidLength) {
    const uuidBuffer = buffer.slice(offset, offset + uuidLength);
    const uuidString = bufferToUUID(uuidLength, uuidBuffer);
    if (!uuidString) {
      return undefined;
    }
    uuids.push(uuidString);
  }

  return uuids;
}

function parseFlags(buffer) {
  let flags = [];

  for (let offset = 0; offset < buffer.length; offset++) {
    const octet = buffer[offset];
    const flagMap = MAPS.flags.get(offset); // eslint-disable-line no-use-before-define

    for (let shiftCount = 0; shiftCount < 8; shiftCount++) {
      const flag = 1 << shiftCount;
      if (flag & octet) {
        const flagInfo = flagMap.get(flag);
        if (!flagInfo) {
          log.info(`Unknown flag set: octet ${offset}, bit ${shiftCount + 1}`);
          continue;
        }
        flags.push(flagInfo);
      }
    }
  }

  return flags;
}

function parseServiceData(uuidLength, buffer) {
  if (uuidLength !== 16 && uuidLength !== 4 && uuidLength !== 2) {
    throw new Error(`Unsupported length: ${uuidLength}`);
  }

  if (!buffer.length) {
    log.info('Empty buffer calling parseServiceData()');
    return undefined;
  }

  if (buffer.length < uuidLength) {
    log.info('Incomplete buffer calling parseServiceData()');
    return undefined;
  }

  let serviceUUID;
  let data;
  if (buffer.length === uuidLength) {
    serviceUUID = bufferToUUID(uuidLength, buffer);
    data = new Buffer();
  } else {
    serviceUUID = bufferToUUID(uuidLength, buffer.slice(0, uuidLength));
    data = buffer.slice(uuidLength);
  }

  if (!serviceUUID) {
    return undefined;
  }

  return {
    uuid: serviceUUID,
    data,
  };
}

function parseManufacturerData(buffer) {
  if (!buffer.length) {
    log.info('Empty buffer calling parseManufacturerData()');
    return undefined;
  }

  let manufacturerCode;
  let manufacturerName;

  if (buffer.length > 2) {
    manufacturerCode = buffer.readUInt16LE(0, /* noAssert */ true);
    manufacturerName = MAPS.manufacturers.get(manufacturerCode); // eslint-disable-line no-use-before-define
  } else {
    manufacturerCode = 0xffff; // TODO: Is this right?
    manufacturerName = 'Unknown';
  }

  return {
    manufacturerCode,
    manufacturerName,
    buffer,
  };
}

export default function(buffer: Buffer) {
  invariant(buffer instanceof Buffer);

  if (!buffer.length) {
    log.info('Empty advertising data buffer');
    return undefined;
  }

  let bufferOffset = 0;

  let data = [ ];

  for ( ; ; ) {
    if (bufferOffset === buffer.length) {
      log.info('Missing final 0');
      break;
    }

    const dataLength = buffer.readUInt8(bufferOffset, /* noAssert */ true);
    bufferOffset++;

    if (!dataLength) {
      // All done.
      break;
    }

    if (buffer.length < bufferOffset + dataLength) {
      log.info('Incomplete advertising data buffer');
      return undefined;
    }

    // The |dataType| takes one byte from |dataLength|. The rest is for the
    // payload.
    const dataTypeOffset = bufferOffset;
    const dataTypeLength = 1;
    const payloadOffset = dataTypeOffset + dataTypeLength;
    const payloadLength = dataLength - dataTypeLength;

    const dataType = buffer.readUInt8(dataTypeOffset, /* noAssert */ true);
    const payload = buffer.slice(payloadOffset, payloadOffset + payloadLength);

    const typeMeta = MAPS.types.get(dataType); // eslint-disable-line no-use-before-define

    let successfulParse = false;

    if (typeMeta) {
      const parsedPayload = typeMeta.parse(payload);
      if (parsedPayload !== undefined) {
        data.push({
          type: typeMeta.type,
          description: typeMeta.description,
          data: parsedPayload,
        });
        successfulParse = true;
      } else {
        log.info('Failed to parse data type 0x%s with length 0x%s',
            dataType.toString(16),
            payloadLength.toString(16));
      }
    } else {
      log.info('Unknown advertising data type 0x%s with length 0x%s',
          dataType.toString(16),
          payloadLength.toString(16));
    }

    if (!successfulParse) {
      data.push({
        type: dataType,
        description: typeMeta ? typeMeta.description : 'Unknown',
        data: bufferToHexString(buffer),
      });
    }

    bufferOffset += dataLength;
  }

  return data;
}

// These are big maps so they're all instantiated lazily.
const MAPS = Object.defineProperties({ }, {

  types: {
    get() {
      delete this.types;
      this.types = new Map([
/* eslint-disable indent, object-curly-spacing */
        [ 0x01, { description: 'Flags',
                  type: 'flags',
                  parse: parseFlags } ],
        [ 0x02, { description: 'Incomplete List of 16-bit Service Class UUIDs',
                  type: 'service-uuids',
                  parse: bufferToUUIDArray.bind(null, 2) } ],
        [ 0x03, { description: 'Complete List of 16-bit Service Class UUIDs',
                  type: 'service-uuids',
                  parse: bufferToUUIDArray.bind(null, 2) } ],
        [ 0x04, { description: 'Incomplete List of 32-bit Service Class UUIDs',
                  type: 'service-uuids',
                  parse: bufferToUUIDArray.bind(null, 4) } ],
        [ 0x05, { description: 'Complete List of 32-bit Service Class UUIDs',
                  type: 'service-uuids',
                  parse: bufferToUUIDArray.bind(null, 4) } ],
        [ 0x06, { description: 'Incomplete List of 128-bit Service Class UUIDs',
                  type: 'service-uuids',
                  parse: bufferToUUIDArray.bind(null, 16) } ],
        [ 0x07, { description: 'Complete List of 128-bit Service Class UUIDs',
                  type: 'service-uuids',
                  parse: bufferToUUIDArray.bind(null, 16) } ],
        [ 0x08, { description: 'Shortened Local Name',
                  type: 'short-name',
                  parse: bufferToString } ],
        [ 0x09, { description: 'Complete Local Name',
                  type: 'full-name',
                  parse: bufferToString } ],
        [ 0x0a, { description: 'Tx Power Level',
                  type: 'tx-power',
                  parse: bufferToInt8 } ],
        // Not specified: [ 0x0b { description: '', parse: bufferToHexString } ],
        // Not specified: [ 0x0c { description: '', parse: bufferToHexString } ],
        [ 0x0d, { description: 'Class of Device',
                  type: 'device-class',
                  parse: bufferToHexString } ],
        [ 0x0e, { description: 'Simple Pairing Hash [ C | C-192 ]',
                  type: 'pairing-hash',
                  parse: bufferToHexString } ],
        [ 0x0f, { description: 'Simple Pairing Randomizer R',
                  type: 'pairing-randomizer',
                  parse: bufferToHexString } ],
        [ 0x10, { description: '[ Device ID | Security Manager TK Value ]',
                  type: 'sm-tk',
                  parse: bufferToHexString } ],
        [ 0x11, { description: 'Security Manager Out of Band Flags',
                  type: 'sm-oobf',
                  parse: bufferToHexString } ],
        [ 0x12, { description: 'Slave Connection Interval Range',
                  type: 'scir',
                  parse: bufferToHexString } ],
        // Not specified: [ 0x13 { description: '', parse: bufferToHexString } ],
        [ 0x14, { description: 'List of 16-bit Service Solicitation UUIDs',
                  type: 'service-uuids',
                  parse: bufferToUUIDArray.bind(null, 2) } ],
        [ 0x15, { description: 'List of 128-bit Service Solicitation UUIDs',
                  type: 'service-uuids',
                  parse: bufferToUUIDArray.bind(null, 16) } ],
        [ 0x16, { description: 'Service Data - 16-bit UUID',
                  type: 'service-data',
                  parse: parseServiceData.bind(null, 2) } ],
        [ 0x17, { description: 'Public Target Address',
                  type: 'public-address',
                  parse: bufferToHexString } ],
        [ 0x18, { description: 'Random Target Address',
                  type: 'random-address',
                  parse: bufferToHexString } ],
        [ 0x19, { description: 'Appearance',
                  type: 'appearance',
                  parse: bufferToHexString } ],
        [ 0x1a, { description: 'Advertising Interval',
                  type: 'advertising-interval',
                  parse: bufferToHexString } ],
        [ 0x1b, { description: 'LE Bluetooth Device Address',
                  type: 'le-address',
                  parse: bufferToHexString } ],
        [ 0x1c, { description: 'LE Role',
                  type: 'le-role',
                  parse: bufferToHexString } ],
        [ 0x1d, { description: 'Simple Pairing Hash C-256',
                  type: 'pairing-hash-256',
                  parse: bufferToHexString } ],
        [ 0x1e, { description: 'Simple Pairing Randomizer R-256',
                  type: 'pairing-randomizer-256',
                  parse: bufferToHexString } ],
        [ 0x1f, { description: 'List of 32-bit Service Solicitation UUIDs',
                  type: 'service-uuids',
                  parse: bufferToUUIDArray.bind(null, 4) } ],
        [ 0x20, { description: 'Service Data - 32-bit UUID',
                  type: 'service-data',
                  parse: parseServiceData.bind(null, 4) } ],
        [ 0x21, { description: 'Service Data - 128-bit UUID',
                  type: 'service-data',
                  parse: parseServiceData.bind(null, 16) } ],
        [ 0x22, { description: 'LE Secure Connections Confirmation Value',
                  type: 'le-sc-confirmation',
                  parse: bufferToHexString } ],
        [ 0x23, { description: 'LE Secure Connections Random Value',
                  type: 'le-sc-random',
                  parse: bufferToHexString } ],
        [ 0x3d, { description: '3D Information Data',
                  type: '3d',
                  parse: bufferToHexString } ],
        [ 0xff, { description: 'Manufacturer Specific Data',
                  type: 'manufacturer-data',
                  parse: parseManufacturerData } ],
/* eslint-enable indent, object-curly-spacing */
      ]);
      return this.types;
    },
    configurable: true,
    enumerable: true,
  },

  flags: {
    get() {
      delete this.flags;
      this.flags = new Map([
        [ 0, new Map([
          [ 1 << 0, {
            description: 'LE Limited Discoverable Mode',
            value: '0x' + ((1 << 0) << 0).toString(16),
          }],
          [ 1 << 1, {
            description: 'LE General Discoverable Mode',
            value: '0x' + ((1 << 1) << 0).toString(16),
          }],
          [ 1 << 2, {
            description: 'BR/EDR Not Supported',
            value: '0x' + ((1 << 2) << 0).toString(16),
          }],
          [ 1 << 3, {
            description: 'Simultaneous LE and BR/EDR to Same Device Capable (Controller)',
            value: '0x' + ((1 << 3) << 0).toString(16),
          }],
          [ 1 << 4, {
            description: 'Simultaneous LE and BR/EDR to Same Device Capable (Host)',
            value: '0x' + ((1 << 4) << 0).toString(16),
          }],
        ]) ],
      ]);
      return this.flags;
    },
    configurable: true,
    enumerable: true,
  },

  manufacturers: {
    get() {
      delete this.manufacturers;
      this.manufacturers = new Map([
        [ 0x0000, 'Ericsson Technology Licensing' ],
        [ 0x0001, 'Nokia Mobile Phones' ],
        [ 0x0002, 'Intel Corp.' ],
        [ 0x0003, 'IBM Corp.' ],
        [ 0x0004, 'Toshiba Corp.' ],
        [ 0x0005, '3Com' ],
        [ 0x0006, 'Microsoft' ],
        [ 0x0007, 'Lucent' ],
        [ 0x0008, 'Motorola' ],
        [ 0x0009, 'Infineon Technologies AG' ],
        [ 0x000a, 'Cambridge Silicon Radio' ],
        [ 0x000b, 'Silicon Wave' ],
        [ 0x000c, 'Digianswer A/S' ],
        [ 0x000d, 'Texas Instruments Inc.' ],
        [ 0x000e, 'Ceva, Inc. (formerly Parthus Technologies, Inc.)' ],
        [ 0x000f, 'Broadcom Corporation' ],
        [ 0x0010, 'Mitel Semiconductor' ],
        [ 0x0011, 'Widcomm, Inc' ],
        [ 0x0012, 'Zeevo, Inc.' ],
        [ 0x0013, 'Atmel Corporation' ],
        [ 0x0014, 'Mitsubishi Electric Corporation' ],
        [ 0x0015, 'RTX Telecom A/S' ],
        [ 0x0016, 'KC Technology Inc.' ],
        [ 0x0017, 'NewLogic' ],
        [ 0x0018, 'Transilica, Inc.' ],
        [ 0x0019, 'Rohde & Schwarz GmbH & Co. KG' ],
        [ 0x001a, 'TTPCom Limited' ],
        [ 0x001b, 'Signia Technologies, Inc.' ],
        [ 0x001c, 'Conexant Systems Inc.' ],
        [ 0x001d, 'Qualcomm' ],
        [ 0x001e, 'Inventel' ],
        [ 0x001f, 'AVM Berlin' ],
        [ 0x0020, 'BandSpeed, Inc.' ],
        [ 0x0021, 'Mansella Ltd' ],
        [ 0x0022, 'NEC Corporation' ],
        [ 0x0023, 'WavePlus Technology Co., Ltd.' ],
        [ 0x0024, 'Alcatel' ],
        [ 0x0025, 'NXP Semiconductors (formerly Philips Semiconductors)' ],
        [ 0x0026, 'C Technologies' ],
        [ 0x0027, 'Open Interface' ],
        [ 0x0028, 'R F Micro Devices' ],
        [ 0x0029, 'Hitachi Ltd' ],
        [ 0x002a, 'Symbol Technologies, Inc.' ],
        [ 0x002b, 'Tenovis' ],
        [ 0x002c, 'Macronix International Co. Ltd.' ],
        [ 0x002d, 'GCT Semiconductor' ],
        [ 0x002e, 'Norwood Systems' ],
        [ 0x002f, 'MewTel Technology Inc.' ],
        [ 0x0030, 'ST Microelectronics' ],
        [ 0x0031, 'Synopsis' ],
        [ 0x0032, 'Red-M (Communications) Ltd' ],
        [ 0x0033, 'Commil Ltd' ],
        [ 0x0034, 'Computer Access Technology Corporation (CATC)' ],
        [ 0x0035, 'Eclipse (HQ Espana) S.L.' ],
        [ 0x0036, 'Renesas Electronics Corporation' ],
        [ 0x0037, 'Mobilian Corporation' ],
        [ 0x0038, 'Terax' ],
        [ 0x0039, 'Integrated System Solution Corp.' ],
        [ 0x003a, 'Matsushita Electric Industrial Co., Ltd.' ],
        [ 0x003b, 'Gennum Corporation' ],
        [ 0x003c, 'BlackBerry Limited (formerly Research In Motion)' ],
        [ 0x003d, 'IPextreme, Inc.' ],
        [ 0x003e, 'Systems and Chips, Inc.' ],
        [ 0x003f, 'Bluetooth SIG, Inc.' ],
        [ 0x0040, 'Seiko Epson Corporation' ],
        [ 0x0041, 'Integrated Silicon Solution Taiwan, Inc.' ],
        [ 0x0042, 'CONWISE Technology Corporation Ltd' ],
        [ 0x0043, 'PARROT SA' ],
        [ 0x0044, 'Socket Mobile' ],
        [ 0x0045, 'Atheros Communications, Inc.' ],
        [ 0x0046, 'MediaTek, Inc.' ],
        [ 0x0047, 'Bluegiga' ],
        [ 0x0048, 'Marvell Technology Group Ltd.' ],
        [ 0x0049, '3DSP Corporation' ],
        [ 0x004a, 'Accel Semiconductor Ltd.' ],
        [ 0x004b, 'Continental Automotive Systems' ],
        [ 0x004c, 'Apple, Inc.' ],
        [ 0x004d, 'Staccato Communications, Inc.' ],
        [ 0x004e, 'Avago Technologies' ],
        [ 0x004f, 'APT Licensing Ltd.' ],
        [ 0x0050, 'SiRF Technology' ],
        [ 0x0051, 'Tzero Technologies, Inc.' ],
        [ 0x0052, 'J&M Corporation' ],
        [ 0x0053, 'Free2move AB' ],
        [ 0x0054, '3DiJoy Corporation' ],
        [ 0x0055, 'Plantronics, Inc.' ],
        [ 0x0056, 'Sony Ericsson Mobile Communications' ],
        [ 0x0057, 'Harman International Industries, Inc.' ],
        [ 0x0058, 'Vizio, Inc.' ],
        [ 0x0059, 'Nordic Semiconductor ASA' ],
        [ 0x005a, 'EM Microelectronic-Marin SA' ],
        [ 0x005b, 'Ralink Technology Corporation' ],
        [ 0x005c, 'Belkin International, Inc.' ],
        [ 0x005d, 'Realtek Semiconductor Corporation' ],
        [ 0x005e, 'Stonestreet One, LLC' ],
        [ 0x005f, 'Wicentric, Inc.' ],
        [ 0x0060, 'RivieraWaves S.A.S' ],
        [ 0x0061, 'RDA Microelectronics' ],
        [ 0x0062, 'Gibson Guitars' ],
        [ 0x0063, 'MiCommand Inc.' ],
        [ 0x0064, 'Band XI International, LLC' ],
        [ 0x0065, 'Hewlett-Packard Company' ],
        [ 0x0066, '9Solutions Oy' ],
        [ 0x0067, 'GN Netcom A/S' ],
        [ 0x0068, 'General Motors' ],
        [ 0x0069, 'A&D Engineering, Inc.' ],
        [ 0x006a, 'MindTree Ltd.' ],
        [ 0x006b, 'Polar Electro OY' ],
        [ 0x006c, 'Beautiful Enterprise Co., Ltd.' ],
        [ 0x006d, 'BriarTek, Inc.' ],
        [ 0x006e, 'Summit Data Communications, Inc.' ],
        [ 0x006f, 'Sound ID' ],
        [ 0x0070, 'Monster, LLC' ],
        [ 0x0071, 'connectBlue AB' ],
        [ 0x0072, 'ShangHai Super Smart Electronics Co. Ltd.' ],
        [ 0x0073, 'Group Sense Ltd.' ],
        [ 0x0074, 'Zomm, LLC' ],
        [ 0x0075, 'Samsung Electronics Co. Ltd.' ],
        [ 0x0076, 'Creative Technology Ltd.' ],
        [ 0x0077, 'Laird Technologies' ],
        [ 0x0078, 'Nike, Inc.' ],
        [ 0x0079, 'lesswire AG' ],
        [ 0x007a, 'MStar Semiconductor, Inc.' ],
        [ 0x007b, 'Hanlynn Technologies' ],
        [ 0x007c, 'A & R Cambridge' ],
        [ 0x007d, 'Seers Technology Co. Ltd' ],
        [ 0x007e, 'Sports Tracking Technologies Ltd.' ],
        [ 0x007f, 'Autonet Mobile' ],
        [ 0x0080, 'DeLorme Publishing Company, Inc.' ],
        [ 0x0081, 'WuXi Vimicro' ],
        [ 0x0082, 'Sennheiser Communications A/S' ],
        [ 0x0083, 'TimeKeeping Systems, Inc.' ],
        [ 0x0084, 'Ludus Helsinki Ltd.' ],
        [ 0x0085, 'BlueRadios, Inc.' ],
        [ 0x0086, 'equinox AG' ],
        [ 0x0087, 'Garmin International, Inc.' ],
        [ 0x0088, 'Ecotest' ],
        [ 0x0089, 'GN ReSound A/S' ],
        [ 0x008a, 'Jawbone' ],
        [ 0x008b, 'Topcorn Positioning Systems, LLC' ],
        [ 0x008c, 'Gimbal Inc. (formerly Qualcomm Labs, Inc. and Qualcomm Retail Solutions, Inc.)​​' ],
        [ 0x008d, 'Zscan Software' ],
        [ 0x008e, 'Quintic Corp.' ],
        [ 0x008f, 'Stollman E+V GmbH' ],
        [ 0x0090, 'Funai Electric Co., Ltd.' ],
        [ 0x0091, 'Advanced PANMOBIL Systems GmbH & Co. KG' ],
        [ 0x0092, 'ThinkOptics, Inc.' ],
        [ 0x0093, 'Universal Electronics, Inc.' ],
        [ 0x0094, 'Airoha Technology Corp.' ],
        [ 0x0095, 'NEC Lighting, Ltd.' ],
        [ 0x0096, 'ODM Technology, Inc.' ],
        [ 0x0097, 'ConnecteDevice Ltd.' ],
        [ 0x0098, 'zer01.tv GmbH' ],
        [ 0x0099, 'i.Tech Dynamic Global Distribution Ltd.' ],
        [ 0x009a, 'Alpwise' ],
        [ 0x009b, 'Jiangsu Toppower Automotive Electronics Co., Ltd.' ],
        [ 0x009c, 'Colorfy, Inc.' ],
        [ 0x009d, 'Geoforce Inc.' ],
        [ 0x009e, 'Bose Corporation' ],
        [ 0x009f, 'Suunto Oy' ],
        [ 0x00a0, 'Kensington Computer Products Group' ],
        [ 0x00a1, 'SR-Medizinelektronik' ],
        [ 0x00a2, 'Vertu Corporation Limited' ],
        [ 0x00a3, 'Meta Watch Ltd.' ],
        [ 0x00a4, 'LINAK A/S' ],
        [ 0x00a5, 'OTL Dynamics LLC' ],
        [ 0x00a6, 'Panda Ocean Inc.' ],
        [ 0x00a7, 'Visteon Corporation' ],
        [ 0x00a8, 'ARP Devices Limited' ],
        [ 0x00a9, 'Magneti Marelli S.p.A' ],
        [ 0x00aa, 'CAEN RFID srl' ],
        [ 0x00ab, 'Ingenieur-Systemgruppe Zahn GmbH' ],
        [ 0x00ac, 'Green Throttle Games' ],
        [ 0x00ad, 'Peter Systemtechnik GmbH' ],
        [ 0x00ae, 'Omegawave Oy' ],
        [ 0x00af, 'Cinetix' ],
        [ 0x00b0, 'Passif Semiconductor Corp' ],
        [ 0x00b1, 'Saris Cycling Group, Inc' ],
        [ 0x00b2, 'Bekey A/S' ],
        [ 0x00b3, 'Clarinox Technologies Pty. Ltd.' ],
        [ 0x00b4, 'BDE Technology Co., Ltd.' ],
        [ 0x00b5, 'Swirl Networks' ],
        [ 0x00b6, 'Meso international' ],
        [ 0x00b7, 'TreLab Ltd' ],
        [ 0x00b8, 'Qualcomm Innovation Center, Inc. (QuIC)' ],
        [ 0x00b9, 'Johnson Controls, Inc.' ],
        [ 0x00bA, 'Starkey Laboratories Inc.' ],
        [ 0x00bb, 'S-Power Electronics Limited' ],
        [ 0x00bc, 'Ace Sensor Inc' ],
        [ 0x00bd, 'Aplix Corporation' ],
        [ 0x00be, 'AAMP of America' ],
        [ 0x00bf, 'Stalmart Technology Limited' ],
        [ 0x00c0, 'AMICCOM Electronics Corporation' ],
        [ 0x00c1, 'Shenzhen Excelsecu Data Technology Co.,Ltd' ],
        [ 0x00c2, 'Geneq Inc.' ],
        [ 0x00c3, 'adidas AG' ],
        [ 0x00c4, 'LG Electronics​' ],
        [ 0x00c5, 'Onset Computer Corporation' ],
        [ 0x00c6, 'Selfly BV' ],
        [ 0x00c7, 'Quuppa Oy.' ],
        [ 0x00c8, 'GeLo Inc' ],
        [ 0x00c9, 'Evluma' ],
        [ 0x00cA, 'MC10' ],
        [ 0x00cB, 'Binauric SE' ],
        [ 0x00cc, 'Beats Electronics' ],
        [ 0x00cd, 'Microchip Technology Inc.' ],
        [ 0x00ce, 'Elgato Systems GmbH' ],
        [ 0x00cf, 'ARCHOS SA' ],
        [ 0x00d0, 'Dexcom, Inc.' ],
        [ 0x00d1, 'Polar Electro Europe B.V.' ],
        [ 0x00d2, 'Dialog Semiconductor B.V.' ],
        [ 0x00d3, 'Taixingbang Technology (HK) Co,. LTD.' ],
        [ 0x00d4, 'Kawantech' ],
        [ 0x00d5, 'Austco Communication Systems' ],
        [ 0x00d6, 'Timex Group USA, Inc.' ],
        [ 0x00d7, 'Qualcomm Technologies, Inc.' ],
        [ 0x00d8, 'Qualcomm Connected Experiences, Inc.' ],
        [ 0x00d9, 'Voyetra Turtle Beach' ],
        [ 0x00dA, 'txtr GmbH' ],
        [ 0x00dB, 'Biosentronics' ],
        [ 0x00dC, 'Procter & Gamble' ],
        [ 0x00dd, 'Hosiden Corporation' ],
        [ 0x00de, 'Muzik LLC' ],
        [ 0x00df, 'Misfit Wearables Corp' ],
        [ 0x00e0, 'Google' ],
        [ 0x00e1, 'Danlers Ltd' ],
        [ 0x00e2, 'Semilink Inc' ],
        [ 0x00e3, 'inMusic Brands, Inc' ],
        [ 0x00e4, 'L.S. Research Inc.' ],
        [ 0x00e5, 'Eden Software Consultants Ltd.' ],
        [ 0x00e6, 'Freshtemp' ],
        [ 0x00e7, 'KS Technologies' ],
        [ 0x00e8, 'ACTS Technologies' ],
        [ 0x00e9, 'Vtrack Systems' ],
        [ 0x00eA, 'Nielsen-Kellerman Company' ],
        [ 0x00eB, 'Server Technology, Inc.' ],
        [ 0x00eC, 'BioResearch Associates' ],
        [ 0x00eD, 'Jolly Logic, LLC' ],
        [ 0x00ee, 'Above Average Outcomes, Inc.' ],
        [ 0x00ef, 'Bitsplitters GmbH' ],
        [ 0x00f0, 'PayPal, Inc.' ],
        [ 0x00f1, 'Witron Technology Limited' ],
        [ 0x00f2, 'Aether Things Inc. (formerly Morse Project Inc.)' ],
        [ 0x00f3, 'Kent Displays Inc.' ],
        [ 0x00f4, 'Nautilus Inc​.' ],
        [ 0x00f5, 'Smartifier Oy' ],
        [ 0x00f6, 'Elcometer Limited' ],
        [ 0x00f7, 'VSN Technologies Inc.' ],
        [ 0x00f8, 'AceUni Corp., Ltd.' ],
        [ 0x00f9, 'StickNFind' ],
        [ 0x00fA, 'Crystal Code AB' ],
        [ 0x00fB, 'KOUKAAM a.s.' ],
        [ 0x00fC, 'Delphi Corporation' ],
        [ 0x00fD, 'ValenceTech Limited' ],
        [ 0x00fE, 'Reserved' ],
        [ 0x00ff, 'Typo Products, LLC' ],
        [ 0x0100, 'TomTom International BV' ],
        [ 0x0101, 'Fugoo, Inc' ],
        [ 0x0102, 'Keiser Corporation' ],
        [ 0x0103, 'Bang & Olufsen A/S' ],
        [ 0x0104, 'PLUS Locations Systems Pty Ltd' ],
        [ 0x0105, 'Ubiquitous Computing Technology Corporation' ],
        [ 0x0106, 'Innovative Yachtter Solutions' ],
        [ 0x0107, 'William Demant Holding A/S' ],
        [ 0x0108, 'Chicony Electronics Co., Ltd.' ],
        [ 0x0109, 'Atus BV' ],
        [ 0x010a, 'Codegate Ltd.' ],
        [ 0x010b, 'ERi, Inc.' ],
        [ 0x010c, 'Transducers Direct, LLC' ],
        [ 0x010d, 'Fujitsu Ten Limited' ],
        [ 0x010e, 'Audi AG' ],
        [ 0x010f, 'HiSilicon Technologies Co., Ltd.' ],
        [ 0x0110, 'Nippon Seiki Co., Ltd.' ],
        [ 0x0111, 'Steelseries ApS' ],
        [ 0x0112, 'vyzybl Inc.' ],
        [ 0x0113, 'Openbrain Technologies, Co., Ltd.' ],
        [ 0x0114, 'Xensr' ],
        [ 0x0115, 'e.solutions' ],
        [ 0x0116, '1OAK Technologies' ],
        [ 0x0117, 'Wimoto Technologies Inc' ],
        [ 0x0118, 'Radius Networks, Inc.' ],
        [ 0x0119, 'Wize Technology Co., Ltd.' ],
        [ 0x011a, 'Qualcomm Labs, Inc.' ],
        [ 0x011b, 'Aruba Networks' ],
        [ 0x011c, 'Baidu' ],
        [ 0x011d, 'Arendi AG' ],
        [ 0x011e, 'Skoda Auto a.s.' ],
        [ 0x011f, 'Volkswagon AG' ],
        [ 0x0120, 'Porsche AG' ],
        [ 0x0121, 'Sino Wealth Electronic Ltd.' ],
        [ 0x0122, 'AirTurn, Inc.' ],
        [ 0x0123, 'Kinsa, Inc.' ],
        [ 0x0124, 'HID Global' ],
        [ 0x0125, 'SEAT es' ],
        [ 0x0126, 'Promethean Ltd.' ],
        [ 0x0127, 'Salutica Allied Solutions' ],
        [ 0x0128, 'GPSI Group Pty Ltd' ],
        [ 0x0129, 'Nimble Devices Oy' ],
        [ 0x012a, 'Changzhou Yongse Infotech Co., Ltd' ],
        [ 0x012b, 'SportIQ' ],
        [ 0x012c, 'TEMEC Instruments B.V.' ],
        [ 0x012d, 'Sony Corporation' ],
        [ 0x012e, 'ASSA ABLOY' ],
        [ 0x012f, 'Clarion Co., Ltd.' ],
        [ 0x0130, 'Warehouse Innovations' ],
        [ 0x0131, 'Cypress Semiconductor Corporation' ],
        [ 0x0132, 'MADS Inc' ],
        [ 0x0133, 'Blue Maestro Limited' ],
        [ 0x0134, 'Resolution Products, Inc.' ],
        [ 0x0135, 'Airewear LLC' ],
        [ 0x0136, 'Seed Labs, Inc. (formerly ETC sp. z.o.o.)​' ],
        [ 0x0137, 'Prestigio Plaza Ltd.' ],
        [ 0x0138, 'NTEO Inc.' ],
        [ 0x0139, 'Focus Systems Corporation' ],
        [ 0x013a, 'Tencent Holdings Limited' ],
        [ 0x013b, 'Allegion' ],
        [ 0x013c, 'Murata Manufacuring Co., Ltd.' ],
        [ 0x013e, 'Nod, Inc.' ],
        [ 0x013f, 'B&B Manufacturing Company' ],
        [ 0x0140, 'Alpine Electronics (China) Co., Ltd' ],
        [ 0x0141, 'FedEx Services' ],
        [ 0x0142, 'Grape Systems Inc.' ],
        [ 0x0143, 'Bkon Connect' ],
        [ 0x0144, 'Lintech GmbH' ],
        [ 0x0145, 'Novatel Wireless' ],
        [ 0x0146, 'Ciright' ],
        [ 0x0147, 'Mighty Cast, Inc.' ],
        [ 0x0148, 'Ambimat Electronics' ],
        [ 0x0149, 'Perytons Ltd.' ],
        [ 0x014a, 'Tivoli Audio, LLC' ],
        [ 0x014b, 'Master Lock' ],
        [ 0x014c, 'Mesh-Net Ltd' ],
        [ 0x014d, 'Huizhou Desay SV Automotive CO., LTD.' ],
        [ 0x014e, 'Tangerine, Inc.' ],
        [ 0x014f, 'B&W Group Ltd.' ],
        [ 0x0150, 'Pioneer Corporation' ],
        [ 0x0151, 'OnBeep' ],
        [ 0x0152, 'Vernier Software & Technology' ],
        [ 0x0153, 'ROL Ergo' ],
        [ 0x0154, 'Pebble Technology' ],
        [ 0x0155, 'NETATMO' ],
        [ 0x0156, 'Accumulate AB' ],
        [ 0x0157, 'Anhui Huami Information Technology Co., Ltd.' ],
        [ 0x0158, 'Inmite s.r.o.' ],
        [ 0x0159, 'ChefSteps, Inc.' ],
        [ 0x015a, 'micas AG' ],
        [ 0x015b, 'Biomedical Research Ltd.' ],
        [ 0x015c, 'Pitius Tec S.L.' ],
        [ 0x015d, 'Estimote, Inc.' ],
        [ 0x015e, 'Unikey Technologies, Inc.' ],
        [ 0x015f, 'Timer Cap Co.' ],
        [ 0x0160, 'AwoX' ],
        [ 0x0161, 'yikes' ],
        [ 0x0162, 'MADSGlobal NZ Ltd.' ],
        [ 0x0163, 'PCH International' ],
        [ 0x0164, 'Qingdao Yeelink Information Technology Co., Ltd.' ],
        [ 0x0165, 'Milwaukee Tool (formerly Milwaukee Electric Tools)' ],
        [ 0x0166, 'MISHIK Pte Ltd' ],
        [ 0x0167, 'Bayer HealthCare' ],
        [ 0x0168, 'Spicebox LLC' ],
        [ 0x0169, 'emberlight' ],
        [ 0x016a, 'Cooper-Atkins Corporation' ],
        [ 0x016b, 'Qblinks' ],
        [ 0x016c, 'MYSPHERA' ],
        [ 0x016d, 'LifeScan Inc' ],
        [ 0x016e, 'Volantic AB' ],
        [ 0x016f, 'Podo Labs, Inc' ],
        [ 0x0170, 'Roche Diabetes Care AG' ],
        [ 0x0171, 'Amazon Fulfillment Service' ],
        [ 0x0172, 'Connovate Technology Private Limited' ],
        [ 0x0173, 'Kocomojo, LLC' ],
        [ 0x0174, 'Everykey LLC' ],
        [ 0x0175, 'Dynamic Controls' ],
        [ 0x0176, 'SentriLock' ],
        [ 0x0177, 'I-SYST inc.' ],
        [ 0x0178, 'CASIO COMPUTER CO., LTD.' ],
        [ 0x0179, 'LAPIS Semiconductor Co., Ltd.' ],
        [ 0x017a, 'Telemonitor, Inc.' ],
        [ 0x017b, 'taskit GmbH' ],
        [ 0x017c, 'Daimler AG' ],
        [ 0x017d, 'BatAndCat' ],
        [ 0x017e, 'BluDotz Ltd' ],
        [ 0x017f, 'XTel ApS' ],
        [ 0x0180, 'Gigaset Communications GmbH' ],
        [ 0x0181, 'Gecko Health Innovations, Inc.' ],
        [ 0x0182, 'HOP Ubiquitous' ],
        [ 0x0183, 'To Be Assigned' ],
        [ 0x0184, 'Nectar' ],
        [ 0x0185, 'bel\'apps LLC' ],
        [ 0x0186, 'CORE Lighting Ltd' ],
        [ 0x0187, 'Seraphim Sense Ltd' ],
        [ 0x0188, 'Unico RBC' ],
        [ 0x0189, 'Physical Enterprises Inc.' ],
        [ 0x018a, 'Able Trend Technology Limited' ],
        [ 0x018b, 'Konica Minolta, Inc.' ],
        [ 0x018c, 'Wilo SE' ],
        [ 0x018d, 'Extron Design Services' ],
        [ 0x018e, 'Fitbit, Inc.' ],
        [ 0x018f, 'Fireflies Systems' ],
        [ 0x0190, 'Intelletto Technologies Inc.' ],
        [ 0x0191, 'FDK CORPORATION' ],
        [ 0x0192, 'Cloudleaf, Inc' ],
        [ 0x0193, 'Maveric Automation LLC' ],
        [ 0x0194, 'Acoustic Stream Corporation' ],
        [ 0x0195, 'Zuli' ],
        [ 0x0196, 'Paxton Access Ltd' ],
        [ 0x0197, 'WiSilica Inc' ],
        [ 0x0198, 'Vengit Limited' ],
        [ 0x0199, 'SALTO SYSTEMS S.L.' ],
        [ 0x019a, 'TRON Forum (formerly T-Engine Forum)' ],
        [ 0x019b, 'CUBETECH s.r.o.' ],
        [ 0x019c, 'Cokiya Incorporated' ],
        [ 0x019d, 'CVS Health' ],
        [ 0x019e, 'Ceruus' ],
        [ 0x019f, 'Strainstall Ltd' ],
        [ 0x01a0, 'Channel Enterprises (HK) Ltd.' ],
        [ 0x01a1, 'FIAMM' ],
        [ 0x01a2, 'GIGALANE.CO.,LTD' ],
        [ 0x01a3, 'EROAD' ],
        [ 0x01a4, 'Mine Safety Appliances' ],
        [ 0x01a5, 'Icon Health and Fitness' ],
        [ 0x01a6, 'Asandoo GmbH' ],
        [ 0x01a7, 'ENERGOUS CORPORATION' ],
        [ 0x01a8, 'Taobao' ],
        [ 0x01a9, 'Canon Inc.' ],
        [ 0x01aa, 'Geophysical Technology Inc.' ],
        [ 0x01ab, 'Facebook, Inc.' ],
        [ 0x01ac, 'Nipro Diagnostics, Inc.' ],
        [ 0x01ad, 'FlightSafety International' ],
        [ 0x01ae, 'Earlens Corporation' ],
        [ 0x01af, 'Sunrise Micro Devices, Inc.' ],
        [ 0x01b0, 'Star Micronics Co., Ltd.' ],
        [ 0x01b1, 'Netizens Sp. z o.o.' ],
        [ 0x01b2, 'Nymi Inc.' ],
        [ 0x01b3, 'Nytec, Inc.' ],
        [ 0x01b4, 'Trineo Sp. z o.o.' ],
        [ 0x01b5, 'Nest Labs Inc.' ],
        [ 0x01b6, 'LM Technologies Ltd' ],
        [ 0x01b7, 'General Electric Company' ],
        [ 0x01b8, 'i+D3 S.L.' ],
        [ 0x01b9, 'HANA Micron' ],
        [ 0x01bA, 'Stages Cycling LLC' ],
        [ 0x01bb, 'Cochlear Bone Anchored Solutions AB' ],
        [ 0x01bc, 'SenionLab AB' ],
        [ 0x01bd, 'Syszone Co., Ltd' ],
        [ 0x01be, 'Pulsate Mobile Ltd.' ],
        [ 0x01bf, 'Hong Kong HunterSun Electronic Limited' ],
        [ 0x01c0, 'pironex GmbH' ],
        [ 0x01c1, 'BRADATECH Corp.' ],
        [ 0x01c2, 'Transenergooil AG' ],
        [ 0x01c3, 'Bunch' ],
        [ 0x01c4, 'DME Microelectronics' ],
        [ 0x01c5, 'Bitcraze AB' ],
        [ 0x01c6, 'HASWARE Inc.' ],
        [ 0x01c7, 'Abiogenix Inc.' ],
        [ 0x01c8, 'Poly-Control ApS' ],
        [ 0x01c9, 'Avi-on' ],
        [ 0x01cA, 'Laerdal Medical AS' ],
        [ 0x01cB, 'Fetch My Pet' ],
        [ 0x01cc, 'Sam Labs Ltd.' ],
        [ 0x01cd, 'Chengdu Synwing Technology Ltd' ],
        [ 0x01ce, 'HOUWA SYSTEM DESIGN, k.k.' ],
        [ 0x01cf, 'BSH' ],
        [ 0x01d0, 'Primus Inter Pares Ltd' ],
        [ 0x01d1, 'August' ],
        [ 0x01d2, 'Gill Electronics' ],
        [ 0x01d3, 'Sky Wave Design' ],
        [ 0x01d4, 'Newlab S.r.l.' ],
        [ 0x01d5, 'ELAD srl​' ],
        [ 0x01d6, 'G-wearables inc.' ],
        [ 0x01d7, 'Squadrone Systems Inc.' ],
        [ 0x01d8, 'Code Corporation' ],
        [ 0x01d9, 'Savant Systems LLC' ],
        [ 0x01dA, 'Logitech International SA' ],
        [ 0x01dB, 'Innblue Consulting' ],
        [ 0x01dC, 'iParking Ltd.' ],
        [ 0x01dd, 'Koninklijke Philips Electronics N.V.' ],
        [ 0x01de, 'Minelab Electronics Pty Limited' ],
        [ 0x01df, 'Bison Group Ltd.' ],
        [ 0x01e0, 'Widex A/S' ],
        [ 0x01e1, 'Jolla Ltd' ],
        [ 0x01e2, 'Lectronix, Inc.' ],
        [ 0x01e3, 'Caterpillar Inc' ],
        [ 0x01e4, 'Freedom Innovations' ],
        [ 0x01e5, 'Dynamic Devices Ltd' ],
        [ 0x01e6, 'Technology Solutions (UK) Ltd' ],
        [ 0x01e7, 'IPS Group Inc.' ],
        [ 0x01e8, 'STIR' ],
        [ 0x01e9, 'Sano, Inc​' ],
        [ 0x01eA, 'Advanced Application Design, Inc.​' ],
        [ 0x01eB, 'AutoMap LLC​' ],
        [ 0x01eC, 'Spreadtrum Communications Shanghai Ltd' ],
        [ 0x01eD, 'CuteCircuit LTD' ],
        [ 0x01ee, 'Valeo Service' ],
        [ 0x01ef, 'Fullpower Technologies, Inc.' ],
        [ 0x01f0, 'KloudNation' ],
        [ 0x01f1, 'Zebra Technologies Corporation' ],
        [ 0x01f2, 'Itron, Inc.' ],
        [ 0x01f3, 'The University of Tokyo' ],
        [ 0x01f4, 'UTC Fire and Security' ],
        [ 0x01f5, 'Cool Webthings Limited' ],
        [ 0x01f6, 'DJO Global' ],
        [ 0x01f7, 'Gelliner Limited' ],
        [ 0x01f8, 'Anyka (Guangzhou) Microelectronics Technology Co, LTD' ],
        [ 0x01f9, 'Medtronic, Inc.' ],
        [ 0x01fA, 'Gozio, Inc.' ],
        [ 0x01fB, 'Form Lifting, LLC' ],
        [ 0x01fC, 'Wahoo Fitness, LLC' ],
        [ 0x01fD, 'Kontakt Micro-Location Sp. z o.o.' ],
        [ 0x01fE, 'Radio System Corporation' ],
        [ 0x01ff, 'Freescale Semiconductor, Inc.' ],
        [ 0x0200, 'Verifone Systems PTe Ltd. Taiwan Branch' ],
        [ 0x0201, 'AR Timing' ],
        [ 0x0202, 'Rigado LLC' ],
        [ 0x0203, 'Kemppi Oy' ],
        [ 0x0204, 'Tapcentive Inc.' ],
        [ 0x0205, 'Smartbotics Inc.​' ],
        [ 0x0206, 'Otter Products, LLC​' ],
        [ 0x0207, 'STEMP Inc.' ],
        [ 0x0208, 'LumiGeek LLC' ],
        [ 0x0209, 'InvisionHeart Inc.' ],
        [ 0x020a, 'Macnica Inc. ​' ],
        [ 0x020b, 'Jaguar Land Rover Limited' ],
        [ 0x020c, 'CoroWare Technologies, Inc' ],
        [ 0x020d, 'Simplo Technology Co., LTD' ],
        [ 0x020e, 'Omron Healthcare Co., LTD' ],
        [ 0x020f, 'Comodule GMBH' ],
        [ 0x0210, 'ikeGPS' ],
        [ 0x0211, 'Telink Semiconductor Co. Ltd' ],
        [ 0x0212, 'Interplan Co., Ltd' ],
        [ 0x0213, 'Wyler AG' ],
        [ 0x0214, 'IK Multimedia Production srl' ],
        [ 0x0215, 'Lukoton Experience Oy' ],
        [ 0x0216, 'MTI Ltd' ],
        [ 0x0217, 'Tech4home, Lda' ],
        [ 0x0218, 'Hiotech AB' ],
        [ 0x0219, 'DOTT Limited' ],
        [ 0x021a, 'Blue Speck Labs, LLC' ],
        [ 0x021b, 'Cisco Systems Inc' ],
        [ 0x021c, 'Mobicomm Inc' ],
        [ 0x021d, 'Edamic' ],
        [ 0x021e, 'Goodnet Ltd' ],
        [ 0x021f, 'Luster Leaf Products Inc' ],
        [ 0x0220, 'Manus Machina BV' ],
        [ 0x0221, 'Mobiquity Networks Inc' ],
        [ 0x0222, 'Praxis Dynamics' ],
        [ 0x0223, 'Philip Morris Products S.A.' ],
        [ 0x0224, 'Comarch SA' ],
        [ 0x0225, 'Nestlé Nespresso S.A.' ],
        [ 0x0226, 'Merlinia A/S' ],
        [ 0x0227, 'LifeBEAM Technologies' ],
        [ 0x0228, 'Twocanoes Labs, LLC' ],
        [ 0x0229, 'Muoverti Limited' ],
        [ 0X022A, 'Stamer Musikanlagen GMBH' ],
        [ 0x022b, 'Tesla Motors' ],
        [ 0x022c, 'Pharynks Corporation' ],
        [ 0x022d, 'Lupine' ],
        [ 0x022e, 'Siemens AG' ],
        [ 0x022f, 'Huami (Shanghai) Culture Communication CO., LTD' ],
        [ 0x0230, 'Foster Electric Company, Ltd' ],
        [ 0x0231, 'ETA SA' ],
        [ 0x0232, 'x-Senso Solutions Kft' ],
        [ 0x0233, 'Shenzhen SuLong Communication Ltd' ],
        [ 0x0234, 'FengFan (BeiJing) Technology Co, Ltd' ],
        [ 0x0235, 'Qrio Inc' ],
        [ 0x0236, 'Pitpatpet Ltd' ],
        [ 0x0237, 'MSHeli s.r.l.' ],
        [ 0x0238, 'Trakm8 Ltd' ],
        [ 0x0239, 'JIN CO, Ltd' ],
        [ 0x023a, 'Alatech Technology' ],
        [ 0x023b, 'Beijing CarePulse Electronic Technology Co, Ltd' ],
        [ 0x023c, 'Awarepoint' ],
        [ 0x023d, 'ViCentra B.V.' ],
        [ 0x023e, 'Raven Industries' ],
        [ 0x023f, 'WaveWare Technologies' ],
        [ 0x0240, 'Argenox Technologies' ],
        [ 0x0241, 'Bragi GmbH' ],
        [ 0x0242, '16Lab Inc' ],
        [ 0x0243, 'Masimo Corp' ],
        [ 0x0244, 'Iotera Inc.' ],
        [ 0x0245, 'Endress+Hauser' ],
        [ 0x0246, 'ACKme Networks, Inc.' ],
        [ 0x0247, 'FiftyThree Inc.' ],
        [ 0x0248, 'Parker Hannifin Corp​' ],
        [ 0x0249, 'Transcranial Ltd' ],
        [ 0x024a, 'Uwatec AG' ],
        [ 0x024b, 'Orlan LLC' ],
        [ 0x024c, 'Blue Clover Devices' ],
        [ 0x024d, 'M-Way Solutions GmbH' ],
        [ 0x024e, 'Microtronics Engineering GmbH' ],
        [ 0x024f, 'Schneider Schreibgeräte GmbH' ],
        [ 0x0250, 'Sapphire Circuits LLC' ],
        [ 0x0251, 'Lumo Bodytech Inc.' ],
        [ 0x0252, 'UKC Technosolution' ],
        [ 0x0253, 'Xicato Inc.' ],
        [ 0x0254, 'Playbrush' ],
        [ 0x0255, 'Dai Nippon Printing Co., Ltd.' ],
        [ 0x0256, 'G24 Power Limited' ],
        [ 0x0257, 'AdBabble Local Commerce Inc.' ],
        [ 0x0258, 'Devialet SA' ],
        [ 0x0259, 'ALTYOR' ],
        [ 0x025a, 'University of Applied Sciences Valais/Haute Ecole Valaisanne' ],
        [ 0x025b, 'Five Interactive, LLC dba Zendo' ],
        [ 0x025c, 'NetEase (Hangzhou) Network co.Ltd.' ],
        [ 0x025d, 'Lexmark International Inc.' ],
        [ 0x025e, 'Fluke Corporation' ],
        [ 0x025f, 'Yardarm Technologies​' ],
        [ 0x0260, 'SensaRx' ],
        [ 0x0261, 'SECVRE GmbH' ],
        [ 0x0262, 'Glacial Ridge Technologies' ],
        [ 0x0263, 'Identiv, Inc.' ],
        [ 0x0264, 'DDS, Inc.' ],
        [ 0x0265, 'SMK Corporation' ],
        [ 0x0266, 'Schawbel Technologies LLC' ],
        [ 0x0267, 'XMI Systems SA' ],
        [ 0x0268, 'Cerevo' ],
        [ 0x0269, 'Torrox GmbH & Co KG' ],
        [ 0x026a, 'Gemalto' ],
        [ 0x026b, 'DEKA Research & Development Corp.​' ],
        [ 0x026c, 'Domster Tadeusz Szydlowski' ],
        [ 0x026d, 'Technogym SPA​' ],
        [ 0x026e, 'FLEURBAEY BVBA' ],
        [ 0x026f, 'Aptcode Solutions​' ],
        [ 0x0270, 'LSI ADL Technology​' ],
      ]);
      return this.manufacturers;
    },
    configurable: true,
    enumerable: true,
  },
});
