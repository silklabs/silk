"use strict";

var formats = {
  0x0001: "lpcm",
  0x0003: "lpcm"
};

function decode(buffer) {
  if (global.Buffer && buffer instanceof global.Buffer) {
    buffer = Uint8Array.from(buffer).buffer;
  }

  return new Promise(function(resolve, reject) {
    var dataView = new DataView(buffer);
    var reader = createReader(dataView);

    if (reader.string(4) !== "RIFF") {
      return reject(new TypeError("Invalid WAV file"));
    }

    reader.uint32(); // skip file length

    if (reader.string(4) !== "WAVE") {
      return reject(new TypeError("Invalid WAV file"));
    }

    var format = null;
    var audioData = null;

    do {
      var chunkType = reader.string(4);
      var chunkSize = reader.uint32();

      switch (chunkType) {
      case "fmt ":
        format = decodeFormat(reader, chunkSize);
        if (format instanceof Error) {
          return reject(format);
        }
        break;
      case "data":
        audioData = decodeData(reader, chunkSize, format);
        if (audioData instanceof Error) {
          return reject(format);
        }
        break;
      default:
        reader.skip(chunkSize);
        break;
      }
    } while (audioData === null);

    resolve(audioData);
  });
}

function decodeFormat(reader, chunkSize) {
  var formatId = reader.uint16();

  if (!formats.hasOwnProperty(formatId)) {
    return new TypeError("Unsupported format in WAV file: 0x" + formatId.toString(16));
  }

  var format = {
    formatId: formatId,
    floatingPoint: formatId === 0x0003,
    numberOfChannels: reader.uint16(),
    sampleRate: reader.uint32(),
    byteRate: reader.uint32(),
    blockSize: reader.uint16(),
    bitDepth: reader.uint16()
  };
  reader.skip(chunkSize - 16);

  return format;
}

function decodeData(reader, chunkSize, format) {
  var length = Math.floor(chunkSize / format.blockSize);
  var numberOfChannels = format.numberOfChannels;
  var sampleRate = format.sampleRate;
  var channelData = new Array(numberOfChannels);

  for (var ch = 0; ch < numberOfChannels; ch++) {
    channelData[ch] = new Float32Array(length);
  }

  var retVal = readPCM(reader, channelData, length, format);

  if (retVal instanceof Error) {
    return retVal;
  }

  return {
    numberOfChannels: numberOfChannels,
    length: length,
    sampleRate: sampleRate,
    channelData: channelData
  };
}

function readPCM(reader, channelData, length, format) {
  var bitDepth = format.bitDepth;
  var floatingPoint = format.floatingPoint ? "f" : "";
  var methodName = "pcm" + bitDepth + floatingPoint;

  if (!reader[methodName]) {
    return new TypeError("Not supported bit depth: " + format.bitDepth);
  }

  var read = reader[methodName].bind(reader);
  var numberOfChannels = format.numberOfChannels;

  for (var i = 0; i < length; i++) {
    for (var ch = 0; ch < numberOfChannels; ch++) {
      channelData[ch][i] = read();
    }
  }

  return null;
}

function createReader(dataView) {
  var pos = 0;

  return {
    skip: function(n) {
      pos += n;
    },
    uint8: function() {
      var data = dataView.getUint8(pos, true);

      pos += 1;

      return data;
    },
    int16: function() {
      var data = dataView.getInt16(pos, true);

      pos += 2;

      return data;
    },
    uint16: function() {
      var data = dataView.getUint16(pos, true);

      pos += 2;

      return data;
    },
    uint32: function() {
      var data = dataView.getUint32(pos, true);

      pos += 4;

      return data;
    },
    string: function(n) {
      var data = "";

      for (var i = 0; i < n; i++) {
        data += String.fromCharCode(this.uint8());
      }

      return data;
    },
    pcm8: function() {
      var data = dataView.getUint8(pos) - 128;

      pos += 1;

      return data < 0 ? data / 128 : data / 127;
    },
    pcm16: function() {
      var data = dataView.getInt16(pos, true);

      pos += 2;

      return data < 0 ? data / 32768 : data / 32767;
    },
    pcm24: function() {
      var x0 = dataView.getUint8(pos + 0);
      var x1 = dataView.getUint8(pos + 1);
      var x2 = dataView.getUint8(pos + 2);
      var xx = (x0 + (x1 << 8) + (x2 << 16));
      var data = xx > 0x800000 ? xx - 0x1000000 : xx;

      pos += 3;

      return data < 0 ? data / 8388608 : data / 8388607;
    },
    pcm32: function() {
      var data = dataView.getInt32(pos, true);

      pos += 4;

      return data < 0 ? data / 2147483648 : data / 2147483647;
    },
    pcm32f: function() {
      var data = dataView.getFloat32(pos, true);

      pos += 4;

      return data;
    },
    pcm64f: function() {
      var data = dataView.getFloat64(pos, true);

      pos += 8;

      return data;
    }
  };
}

module.exports.decode = decode;
