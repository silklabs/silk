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

  play() {
    console.log('play()ing a live track is a no-op');
  }

  stop() {
    console.log('stop()ing a live track is a no-op');
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

/**
 * Audio track wrapped around a statically-sized buffer, for example,
 * the samples from a WAV file read from disk.
 */
const CHUNK_DURATION = 0.1;
export class StaticTrack extends EventEmitter {
  buffer = null;
  sampleRate = 0;
  currentSample = 0;
  progressInterval = null;

  constructor(samples, sampleRate) {
    super();
    this.buffer = new Float32Array(samples.length);
    this.buffer.set(samples);
    this.sampleRate = sampleRate;
  }

  play() {
    if (this.progressInterval) {
      console.log('Already playing');
      return;
    }
    this.progressInterval = setInterval(this._onProgress, 1000 * CHUNK_DURATION);
    this.emit('playing');
  }

  stop() {
    clearInterval(this.progressInterval);
    this.progressInterval = null;
    this.currentSample = 0;
  }

  _onProgress = () => {
    let chunkSamples = (CHUNK_DURATION * this.sampleRate) | 0;
    let chunk = this.buffer.subarray(this.currentSample,
                                     this.currentSample + chunkSamples);
    if (chunk.length === 0) {
      this.emit('ended');
      this.stop();
      return;
    }
    this.emit('progress', chunk,
              this.currentTime, this.startTime, this.endTime);
    this.currentSample += chunk.length;
  };

  get duration() {
    return this.endTime - this.startTime;
  }

  get currentTime() {
    return this.currentSample / this.sampleRate;
  }

  get startTime() {
    return 0.0;
  }

  get endTime() {
    return this.buffer.length / this.sampleRate;
  }

  sliceSamples(start, end) {
    throw 'NYI';
  }
}
