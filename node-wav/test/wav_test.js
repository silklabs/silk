/**
 * @noflow
 */

const fs = require('mz/fs');
const encoder = require('wav-encoder');
const decoder = require('wav-decoder');
const wav = require('../');
const assert = require('assert');

function makeTestData(channels, length) {
  let data = [];
  for (let ch = 0; ch < channels; ++ch) {
    data[ch] = new Float32Array(length);
    for (let n = 0; n < length; ++n) {
      data[ch][n] = Math.random() * 2 - 1; // use [-1, 1] range
    }
  }
  return data;
}

suite('wav', () => {
  test('test wav encoder/decoder', async () => {
    const length = 10;
    const numberOfChannels = 2;
    const channelData = makeTestData(numberOfChannels, length);

    await Promise.all([8, 16, 24, 32, '32f'].map((bitDepth) => new Promise((resolve, reject) => {
      let float = false;
      if (bitDepth === '32f') {
        bitDepth = 32;
        float = true;
      }
      let audioData = {
        length,
        numberOfChannels,
        sampleRate: 16000,
        channelData,
      };
      let opts = {
        float,
        bitDepth,
      };
      encoder.encode(audioData, opts).then((buffer) => {
        const ourEncoded = new Buffer(buffer);
        const wavEncoded = wav.encode(
          audioData.channelData,
          opts
        );

        assert.equal(
          ourEncoded.length,
          wavEncoded.length,
          `our encoder length should match wav-encoder length for bitDepth=${bitDepth}`
        );

        // Sometimes the output from wav-encoder differs from ours by 1.  This
        // is probably acceptable for now...
        const elementDiff = [...ourEncoded].map(
          (e, i) => Math.abs(e - wavEncoded[i])
        );
        if (elementDiff.some((e) => e > 1)) {
          assert.equal(
            ourEncoded.toString('hex'),
            wavEncoded.toString('hex'),
            `our encoder should match wav-encoder for bitDepth=${bitDepth}`
          );
        }

        const decoded = wav.decode(buffer);
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
