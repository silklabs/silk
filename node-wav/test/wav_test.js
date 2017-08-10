/**
 * @noflow
 */

const fs = require('mz/fs');
const encoder = require('wav-encoder');
const decoder = require('wav-decoder');
const wav = require('../');
const assert = require('assert');

function makeTestData(channels, samples) {
  let data = [];
  for (let ch = 0; ch < channels; ++ch) {
    data[ch] = new Float32Array(samples);
    for (let n = 0; n < samples; ++n) {
      data[ch][n] = Math.random() * 2 - 1; // use [-1, 1] range
    }
  }
  return data;
}

suite('wav', () => {
  test('test wav encoder/decoder', async () => {
    let samples = 10;
    let channels = 2;
    let data = makeTestData(channels, samples);
    await Promise.all([8, 16, 24, 32, '32f'].map((bitDepth) => new Promise((resolve, reject) => {
      let floatingPoint = false;
      if (bitDepth === '32f') {
        bitDepth = 32;
        floatingPoint = true;
      }
      let audioData = {
        length: samples,
        numberOfChannels: channels,
        sampleRate: 16000,
        channelData: data,
      };
      let opts = {
        float: floatingPoint,
        bitDepth: bitDepth,
      };
      encoder.encode(audioData, opts).then((buffer) => {
        let encoded = wav.encode(audioData.channelData, opts);
        assert.equal(new Buffer(buffer).toString('hex'), encoded.toString('hex'), 'our encoder should match wav-encoder');
        let decoded = wav.decode(buffer);
        decoder.decode(buffer).then((reference) => {
          assert.equal(reference.length, decoded.channelData[0].length, 'number of samples should match');
          assert.equal(reference.numberOfChannels, decoded.channelData.length, 'number of channels should match');
          assert.equal(reference.sampleRate, decoded.sampleRate, 'sample rate should match');
          assert.deepEqual(reference.channelData, decoded.channelData, 'data should match');
          resolve();
        });
      });
    })));
  });

  test('test buffer offset', () => {
    let files = ['./test/file1.wav'];
    files.forEach(async (file) => {
      let fileBuffer = await fs.readFile(file);
      let decoded = wav.decode(fileBuffer);
      assert.equal(decoded.sampleRate, 16000);
    });
  });
});
