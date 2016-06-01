# wav-decoder
[![Build Status](http://img.shields.io/travis/mohayonao/wav-decoder.svg?style=flat-square)](https://travis-ci.org/mohayonao/wav-decoder)
[![NPM Version](http://img.shields.io/npm/v/wav-decoder.svg?style=flat-square)](https://www.npmjs.org/package/wav-decoder)
[![License](http://img.shields.io/badge/license-MIT-brightgreen.svg?style=flat-square)](http://mohayonao.mit-license.org/)

> promise-based wav decoder

## Installation

```
$ npm install wav-decoder
```

## API

- `decode(src: ArrayBuffer): Promise<AudioData>`
  - if provide an instance of `Buffer`, it is converted to `ArrayBuffer` like `Uint8Array.from(src).buffer` implicitly.

##### Returns

```js
interface AudioData {
  sampleRate: number;
  channelData: Float32Array[];
}
```

## Usage

```js
const fs = require("fs");
const WavDecoder = require("wav-decoder");

const readFile = (filepath) => {
  return new Promise((resolve, reject) => {
    fs.readFile(filepath, (err, buffer) => {
      if (err) {
        return reject(err);
      }
      return resolve(buffer);
    });
  });
};

readFile("foobar.wav").then((buffer) => {
  return WavDecoder.decode(buffer);
}).then(function(audioData) {
  console.log(audioData.sampleRate);
  console.log(audioData.channelData[0]); // Float32Array
  console.log(audioData.channelData[1]); // Float32Array
});
```

## License
MIT
