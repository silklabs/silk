import createLog from 'silk-log';
import { EventEmitter } from 'events';

const log = createLog('AudioTrack');

/**
 * Audio track that updates in real time.  The duration of the track
 * is fixed at construction time, but the start and end continually
 * update as new samples are added.  The track is always in the
 * "playing" state after it's received samples.
 */
export class LiveTrack extends EventEmitter {
  buffer = null;
  sampleRate = 0;
  nrSamples = 0;
  bufferStartTime = 0;

  constructor(sampleBufferSize, sampleRate) {
    super();
    this.buffer = new Float32Array(sampleBufferSize);
    this.sampleRate = sampleRate;
  }

  play() {
    log.debug('play()ing a live track is a no-op');
  }

  stop() {
    log.debug('stop()ing a live track is a no-op');
  }

  getSamples(startTime, endTime) {
    let startPos = this._timeToBufferIndex(startTime);
    let endPos = this._timeToBufferIndex(endTime);
    return this.buffer.subarray(startPos, endPos);
  }

  appendSamples(samples) {
    if (this.nrSamples === 0) {
      this.emit('playing');
    }
    let lastCurrentTime = this.currentTime;
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
    this.nrSamples = Math.min(bufferLength, this.nrSamples + samples.length);
    this.emit('timeupdate', this.currentTime, this.startTime, this.endTime,
              lastCurrentTime);
  }

  get duration() {
    return this.endTime - this.startTime;
  }

  get currentTime() {
    return this.endTime;
  }

  get startTime() {
    return this.bufferStartTime;
  }

  get endTime() {
    return this.startTime + this.nrSamples / this.sampleRate;
  }

  _timeToBufferIndex(time) {
    return (this.sampleRate * (time - this.bufferStartTime)) | 0;
  }
}

/**
 * Audio track wrapped around a statically-sized buffer, for example,
 * the samples from a WAV file read from disk.
 */
const DEFAULT_CHUNK_BUFFER = 0.1;
const DEFAULT_CHUNK_DURATION = 0.5;
export class StaticTrack extends EventEmitter {
  buffer = null;
  chunkBufferSec = 0;
  chunkDurationSec = 0;
  sampleRate = 0;
  timePosition = 0;
  timeUpdateInterval = null;

  constructor(samples, sampleRate,
              chunkDurationSec = DEFAULT_CHUNK_DURATION,
              chunkBufferSec = DEFAULT_CHUNK_BUFFER) {
    super();
    this.buffer = new Float32Array(samples.length);
    this.buffer.set(samples);
    this.chunkBufferSec = chunkBufferSec;
    this.chunkDurationSec = chunkDurationSec;
    this.sampleRate = sampleRate;
  }

  play() {
    if (this.timeUpdateInterval) {
      log.debug('Already playing');
      return;
    }
    setTimeout(this._onTimeUpdate, 1000 * this.chunkBufferSec);
    this.timeUpdateInterval = setInterval(this._onTimeUpdate,
                                          1000 * this.chunkDurationSec);
    this.emit('playing');
  }

  stop() {
    clearInterval(this.timeUpdateInterval);
    this.timeUpdateInterval = null;
  }

  getSamples(startTime, endTime) {
    let startPos = this._timeToBufferIndex(startTime);
    let endPos = this._timeToBufferIndex(endTime);
    return this.buffer.subarray(startPos, endPos);
  }

  _onTimeUpdate = () => {
    let lastTime = this.currentTime;
    this.timePosition += this.chunkDurationSec;
    if (this.timePosition >= this.endTime) {
      this.timePosition = this.endTime;
      this.emit('ended');
      this.stop();
    }
    this.emit('timeupdate', this.currentTime, this.startTime, this.endTime,
              lastTime);
  };

  get duration() {
    return this.endTime - this.startTime;
  }

  get currentTime() {
    return this.timePosition;
  }

  get startTime() {
    return 0.0;
  }

  get endTime() {
    return this.buffer.length / this.sampleRate;
  }

  _timeToBufferIndex(time) {
    return (this.sampleRate * time) | 0;
  }
}
