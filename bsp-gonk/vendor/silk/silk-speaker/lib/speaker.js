/**
 * @noflow
 * @private
 */

let bindings = null;

export type SpeakerType = {
  open(numChannels: number, sampleRate: number, format: number): void;
  write(buffer: Buffer, length: number, onwrite: (written: number) => void): void;
  close(): void;
};

if (process.platform === 'android') {
  bindings = require('../build/Release/silk-speaker.node'); //eslint-disable-line
} else {
  bindings = {
    speaker: {
      setVolume(gain) {
      },
      close() {
      },
      open(numChannels, sampleRate, format) {
      },
      write(buffer, length, onwrite) {
      },
    },
  };
}

module.exports = bindings;
