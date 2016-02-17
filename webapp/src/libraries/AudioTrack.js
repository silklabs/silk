import { EventEmitter } from 'events';

/**
 * Audio track that updates in real time.  The duration of the track
 * is fixed at construction time, but the start and end continually
 * update as new samples are added.  The track is always in the
 * "playing" state after it's received samples.
 */
export class LiveTrack extends EventEmitter {
  buffer = null;
  sampleRate = 0;
  currentSample = 0;
  nrSamples = 0;
  bufferStartTime = 0;

  constructor(sampleBufferSize, sampleRate) {
    super();
    this.buffer = new Float32Array(sampleBufferSize);
    this.sampleRate = sampleRate;
  }

  appendSamples(samples) {
    if (this.nrSamples === 0) {
      this.emit('playing');
    }
    let bufferLength = this.buffer.length;
    samples = samples.subarray(Math.max(samples.length - bufferLength, 0),
                               samples.length);
    let bufferStart = this.nrSamples;
    let bufferEnd = this.nrSamples + samples.length;
    if (bufferEnd > bufferLength) {
      let shift = bufferEnd - bufferLength;
      if (shift < bufferLength) {
        this.buffer.copyWithin(0, shift);
      }
      bufferStart -= shift;
      bufferEnd -= shift;
      this.bufferStartTime += shift / this.sampleRate;
    }
    this.buffer.set(samples, bufferStart);
    this.currentSample = bufferStart;
    this.nrSamples = Math.min(bufferLength, this.nrSamples + samples.length);
    this.emit('progress', this.buffer.subarray(bufferStart, bufferEnd),
              this.currentTime, this.startTime, this.endTime);
  }

  get duration() {
    return this.endTime - this.startTime;
  }

  get currentTime() {
    return this.startTime + this.currentSample / this.sampleRate;
  }
  
  get startTime() {
    return this.bufferStartTime;
  }

  get endTime() {
    return this.startTime + this.nrSamples / this.sampleRate;
  }

  sliceSamples(startTime, endTime) {
    throw 'NYI';
  }
}
