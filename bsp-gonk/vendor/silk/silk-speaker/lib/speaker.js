import bindings from '../build/Release/silk-speaker.node';

export type SpeakerType = {
  open(numChannels: number, sampleRate: number, format: number): void;
  write(buffer: Buffer, length: number, onwrite: (written: number) => void): void;
  close(): void;
}

module.exports = bindings;
