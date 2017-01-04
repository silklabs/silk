/**
 * @flow
 */

const dataDecoders = {
  pcm8: (buffer, offset, output, channels, samples) => {
    let input = new Uint8Array(buffer, offset);
    let pos = 0;
    for (let i = 0; i < samples; ++i) {
      for (let ch = 0; ch < channels; ++ch) {
        let data = input[pos++] - 128;
        output[ch][i] = data < 0 ? data / 128 : data / 127;
      }
    }
  },
  pcm16: (buffer, offset, output, channels, samples) => {
    let input = new Int16Array(buffer, offset);
    let pos = 0;
    for (let i = 0; i < samples; ++i) {
      for (let ch = 0; ch < channels; ++ch) {
        let data = input[pos++];
        output[ch][i] = data < 0 ? data / 32768 : data / 32767;
      }
    }
  },
  pcm24: (buffer, offset, output, channels, samples) => {
    let input = new Uint8Array(buffer, offset);
    let pos = 0;
    for (let i = 0; i < samples; ++i) {
      for (let ch = 0; ch < channels; ++ch) {
        let x0 = input[pos++];
        let x1 = input[pos++];
        let x2 = input[pos++];
        let xx = (x0 + (x1 << 8) + (x2 << 16));
        let data = xx > 0x800000 ? xx - 0x1000000 : xx;
        output[ch][i] = data < 0 ? data / 8388608 : data / 8388607;
      }
    }
  },
  pcm32: (buffer, offset, output, channels, samples) => {
    let input = new Int32Array(buffer, offset);
    let pos = 0;
    for (let i = 0; i < samples; ++i) {
      for (let ch = 0; ch < channels; ++ch) {
        let data = input[pos++];
        output[ch][i] = data < 0 ? data / 2147483648 : data / 2147483647;
      }
    }
  },
  pcm32f: (buffer, offset, output, channels, samples) => {
    let input = new Float32Array(buffer, offset);
    let pos = 0;
    for (let i = 0; i < samples; ++i) {
      for (let ch = 0; ch < channels; ++ch) {
        output[ch][i] = input[pos++];
      }
    }
  },
  pcm64f: (buffer, offset, output, channels, samples) => {
    let input = new Float64Array(buffer, offset);
    let pos = 0;
    for (let i = 0; i < samples; ++i) {
      for (let ch = 0; ch < channels; ++ch) {
        output[ch][i] = input[pos++];
      }
    }
  },
};

const dataEncoders = {
  pcm8: (buffer, offset, input, channels, samples) => {
    let output = new Uint8Array(buffer, offset);
    let pos = 0;
    for (let i = 0; i < samples; ++i) {
      for (let ch = 0; ch < channels; ++ch) {
        let v = Math.max(-1, Math.min(input[ch][i], 1));
        v = ((v * 0.5 + 0.5) * 255) | 0;
        output[pos++] = v;
      }
    }
  },
  pcm16: (buffer, offset, input, channels, samples) => {
    let output = new Int16Array(buffer, offset);
    let pos = 0;
    for (let i = 0; i < samples; ++i) {
      for (let ch = 0; ch < channels; ++ch) {
        let v = Math.max(-1, Math.min(input[ch][i], 1));
        v = ((v < 0) ? v * 32768 : v * 32767) | 0;
        output[pos++] = v;
      }
    }
  },
  pcm24: (buffer, offset, input, channels, samples) => {
    let output = new Uint8Array(buffer, offset);
    let pos = 0;
    for (let i = 0; i < samples; ++i) {
      for (let ch = 0; ch < channels; ++ch) {
        let v = Math.max(-1, Math.min(input[ch][i], 1));
        v = ((v < 0) ? 0x1000000 + v * 8388608 : v * 8388607) | 0;
        output[pos++] = (v >> 0) & 0xff;
        output[pos++] = (v >> 8) & 0xff;
        output[pos++] = (v >> 16) & 0xff;
      }
    }
  },
  pcm32: (buffer, offset, input, channels, samples) => {
    let output = new Int32Array(buffer, offset);
    let pos = 0;
    for (let i = 0; i < samples; ++i) {
      for (let ch = 0; ch < channels; ++ch) {
        let v = Math.max(-1, Math.min(input[ch][i], 1));
        v = ((v < 0) ? v * 2147483648 : v * 2147483647) | 0;
        output[pos++] = v;
      }
    }
  },
  pcm32f: (buffer, offset, input, channels, samples) => {
    let output = new Float32Array(buffer, offset);
    let pos = 0;
    for (let i = 0; i < samples; ++i) {
      for (let ch = 0; ch < channels; ++ch) {
        let v = Math.max(-1, Math.min(input[ch][i], 1));
        output[pos++] = v;
      }
    }
  },
  pcm64f: (buffer, offset, input, channels, samples) => {
    let output = new Float64Array(buffer, offset);
    let pos = 0;
    for (let i = 0; i < samples; ++i) {
      for (let ch = 0; ch < channels; ++ch) {
        let v = Math.max(-1, Math.min(input[ch][i], 1));
        output[pos++] = v;
      }
    }
  },
};

function lookup(table, bitDepth, floatingPoint) {
  let name = 'pcm' + bitDepth + (floatingPoint ? 'f' : '');
  let fn = table[name];
  if (!fn) {
    throw new TypeError('Unsupported data format: ' + name);
  }
  return fn;
}

function decodeHeader(v, pos, end) {
  function u8() {
    let x = v.getUint8(pos);
    pos++;
    return x;
  }

  function u16() {
    let x = v.getUint16(pos, true);
    pos += 2;
    return x;
  }

  function u32() {
    let x = v.getUint32(pos, true);
    pos += 4;
    return x;
  }

  function string(len) {
    let str = '';
    for (let i = 0; i < len; ++i) {
      str += String.fromCharCode(u8());
    }
    return str;
  }

  if (string(4) !== 'RIFF') {
    throw new TypeError('Invalid WAV file');
  }
  u32();
  if (string(4) !== 'WAVE') {
    throw new TypeError('Invalid WAV file');
  }

  let fmt;

  while (pos < end) {
    let type = string(4);
    let size = u32();
    let next = pos + size;
    switch (type) {
    case 'fmt ': {
      let formatId = u16();
      if (formatId !== 0x0001 && formatId !== 0x0003) {
        throw new TypeError('Unsupported format in WAV file: ' + formatId.toString(16));
      }
      fmt = {
        format: 'lpcm',
        floatingPoint: formatId === 0x0003,
        channels: u16(),
        sampleRate: u32(),
        byteRate: u32(),
        blockSize: u16(),
        bitDepth: u16(),
      };
      break;
    }
    case 'data': {
      if (!fmt) {
        throw new TypeError('Missing "fmt " chunk.');
      }
      return {
        fmt,
        pos,
        samples: size / fmt.blockSize,
      };
    }
    default:
      throw new TypeError(`Invalid sub chunk type ${type}`);
    }
    pos = next;
  }
  return null;
}

type DecodeReturnType = {
  sampleRate: number;
  channels: number;
  bitDepth: number;
  channelData: Array<Float32Array>;
};

function decode(buffer: ArrayBuffer | $TypedArray): DecodeReturnType {
  let pos = 0, end = 0;
  if (buffer instanceof ArrayBuffer) {
    // If we are handed a straight up array buffer, start at offset 0 and use
    // the full length of the buffer.
    pos = 0;
    end = buffer.byteLength;
  } else {
    // If we are handed a typed array or a buffer, then we have to consider the
    // offset and length into the underlying array buffer.
    pos = buffer.byteOffset;
    end = buffer.length;
    buffer = buffer.buffer;
  }

  let v = new DataView(buffer);
  let result = decodeHeader(v, pos, end);
  if (!result) {
    throw new Error(`Failed to decode`);
  }

  let fmt = result.fmt;
  let samples = result.samples;
  pos = result.pos;

  let channelData = [];
  for (let ch = 0; ch < fmt.channels; ++ch) {
    channelData[ch] = new Float32Array(samples);
  }
  let decodeData = lookup(dataDecoders, fmt.bitDepth, fmt.floatingPoint);
  decodeData(buffer, pos, channelData, fmt.channels, samples);

  return {
    sampleRate: fmt.sampleRate,
    channels: fmt.channels,
    bitDepth: fmt.bitDepth,
    channelData,
  };
}

type DecodeRawReturnType = {
  sampleRate: number;
  channels: number;
  bitDepth: number;
  channelData: Buffer;
};

function decodeRaw(buffer: ArrayBuffer | $TypedArray): DecodeRawReturnType {
  let pos = 0, end = 0;
  if (buffer instanceof ArrayBuffer) {
    // If we are handed a straight up array buffer, start at offset 0 and use
    // the full length of the buffer.
    pos = 0;
    end = buffer.byteLength;
  } else {
    // If we are handed a typed array or a buffer, then we have to consider the
    // offset and length into the underlying array buffer.
    pos = buffer.byteOffset;
    end = buffer.length;
    buffer = buffer.buffer;
  }

  let v = new DataView(buffer);
  let result = decodeHeader(v, pos, end);
  if (!result) {
    throw new Error(`Failed to decode`);
  }

  let fmt = result.fmt;
  pos = result.pos;

  return {
    sampleRate: fmt.sampleRate,
    channels: fmt.channels,
    bitDepth: fmt.bitDepth,
    channelData: Buffer.from(buffer, pos),
  };
}

function encodeHeader(
  v,
  floatingPoint,
  channels,
  sampleRate,
  bitDepth,
  size
) {
  let pos = 0;

  function u8(x) {
    v.setUint8(pos++, x);
  }

  function u16(x) {
    v.setUint16(pos, x, true);
    pos += 2;
  }

  function u32(x) {
    v.setUint32(pos, x, true);
    pos += 4;
  }

  function string(s) {
    for (let i = 0; i < s.length; ++i) {
      u8(s.charCodeAt(i));
    }
  }

  // write header
  string('RIFF');
  u32(size - 8);
  string('WAVE');

  // write 'fmt ' chunk
  string('fmt ');
  u32(16);
  u16(floatingPoint ? 0x0003 : 0x0001);
  u16(channels);
  u32(sampleRate);
  u32(sampleRate * channels * (bitDepth >> 3));
  u16(channels * (bitDepth >> 3));
  u16(bitDepth);

  // write 'data' chunk
  string('data');
  u32(size - 44);

  return pos;
}

type EncodeOptionsType = {
  sampleRate: number;
  float?: boolean;
  channels?: number;
  bitDepth: number;
};

function encode(
  channelData: Array<Float32Array>,
  opts: EncodeOptionsType
): Buffer {
  let sampleRate = opts.sampleRate || 16000;
  let floatingPoint = !!opts.float;
  let bitDepth = floatingPoint ? 32 : ((opts.bitDepth | 0) || 16);
  let channels = channelData.length;
  let samples = channelData[0].length;
  let encodeData = lookup(dataEncoders, bitDepth, floatingPoint);

  if (channels < 1 || channels > 3) {
    throw new Error(`Atleast 1 channel needs to be specified`);
  }

  let buffer = new ArrayBuffer(44 + (samples * channels * (bitDepth >> 3)));
  let v = new DataView(buffer);

  let pos = encodeHeader(v,
    floatingPoint,
    channels,
    sampleRate,
    bitDepth,
    buffer.byteLength
  );

  encodeData(buffer, pos, channelData, channels, samples);
  return Buffer.from(buffer);
}

function encodeRaw(channelData: Buffer, opts: EncodeOptionsType): Buffer {
  let sampleRate = opts.sampleRate || 16000;
  let floatingPoint = !!opts.float;
  let bitDepth = floatingPoint ? 32 : ((opts.bitDepth | 0) || 16);
  let channels = opts.channels || 1;

  if (channels < 1 || channels > 3) {
    throw new Error(`Atleast 1 channel needs to be specified`);
  }

  let header = new ArrayBuffer(44);
  let v = new DataView(header);

  encodeHeader(v,
    floatingPoint,
    channels,
    sampleRate,
    bitDepth,
    channelData.length + 44
  );

  return Buffer.concat([Buffer.from(header), channelData]);
}

module.exports = {
  decode: decode,
  decodeRaw: decodeRaw,
  encode: encode,
  encodeRaw: encodeRaw,
};
