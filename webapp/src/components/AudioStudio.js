import React from 'react';
import { Button, ButtonGroup, Glyphicon, Input } from 'react-bootstrap';

import AudioVisualizer from './AudioVisualizer';
import Cameras from '../libraries/Cameras';
import FileDrop from './FileDrop';
import { LiveTrack, StaticTrack } from '../libraries/AudioTrack';
import GaplessWAVPlayer from './GaplessWAVPlayer';
import Lightbox from './Lightbox';

function makeWAVFromMicData(micData) {
  let { numChannels, bytesPerSample, sampleRate, samples } = micData;
  samples = new Buffer(samples.buffer);
  let dataSize = samples.length;
  let chunkSize = 36 + dataSize;
  let byteRate = sampleRate * bytesPerSample * numChannels;
  let blockAlign = numChannels * bytesPerSample;
  let bitsPerSample = bytesPerSample * 8;

  let hdr = new Buffer(44);
  hdr.writeUInt32BE(0x52494646, 0);     // "RIFF"
  hdr.writeUInt32LE(chunkSize, 4);      // chunk size
  hdr.writeUInt32BE(0x57415645, 8);     // "WAVE"
  hdr.writeUInt32BE(0x666d7420, 12);    // subchunk1 id- "fmt"
  hdr.writeUInt32LE(16, 16);            // subchunk1 size
  hdr.writeUInt16LE(1, 20);             // audio format
  hdr.writeUInt16LE(numChannels, 22);   // num channels
  hdr.writeUInt32LE(sampleRate, 24);    // sample rate
  hdr.writeUInt32LE(byteRate, 28);      // byte rate
  hdr.writeUInt16LE(blockAlign, 32);    // block align
  hdr.writeUInt16LE(bitsPerSample, 34); // bits per sample
  hdr.writeUInt32BE(0x64617461, 36);    // subchunk2 id - "data"
  hdr.writeUInt32LE(dataSize, 40);      // data size

  let wav = Buffer.concat([ hdr, samples ]);
  return wav.toArrayBuffer();
}

function getAudioDataFromWAV(wav) {
  // TODO: validate WAV format etc.
  let data = (new Uint8Array(wav)).slice(44).buffer;
  return new Int16Array(data);
}

const SAMPLE_RATE = 8000;
const FFT_SIZE = 256;
const WINDOW_OVERLAP = 128;
const SPECTROGRAM_FRAMES = 64;

export default class AudioStudio extends React.Component {
  state = {
    camera: null,
    colorModel: 'jet',
    droppingFile: false,
    playing: false,
    track: null,
  };
  liveTrack = null;

  constructor() {
    super();
  }

  get deviceId() {
    return this.props.params.deviceId;
  }

  componentWillMount() {
    this.liveTrack = new LiveTrack(SPECTROGRAM_FRAMES * FFT_SIZE, SAMPLE_RATE);
    this._attachTrack(this.liveTrack);
    this.state.track = this.liveTrack;
  }

  componentDidMount() {
    Cameras.on('stateChanged', this._onCamerasStateChanged);
    this._onCamerasStateChanged(Cameras);
  }

  componentWillUnmount() {
    this._attachTrack(null);
    this.liveTrack = null;
    let camera = this.state.camera;
    if (camera) {
      camera.removeListener('micData', this._onNextMicData);
    }
    Cameras.removeListener('stateChanged', this._onCamerasStateChanged);
    if (this.mediaSource) {
      this.mediaSource.removeEventListener('sourceopen', this._onSourceOpen);
    }
    if (this.sourceBuffer) {
      this.sourceBuffer.removeEventListener('updateend', this._feedPlayer);
    }
  }

  _attachTrack(track) {
    if (this.state.track === track) {
      return;
    }
    if (this.state.track) {
      this.state.track.removeListener('timeupdate', this._onTimeUpdate);
    }
    if (track) {
      track.on('timeupdate', this._onTimeUpdate);
    }
    this.setState({ track });
  }

  _onCamerasStateChanged = state => {
    let oldCamera = this.state.camera;
    let newCamera = state.cameras[this.deviceId];

    if (oldCamera === newCamera) {
      return;
    }
    if (oldCamera) {
      oldCamera.removeListener('micData', this._onNextMicData);
    }
    if (newCamera) {
      newCamera.on('micData', this._onNextMicData);
    }
    this.setState({ camera: newCamera });
  };


  _onFileDropStart = () => {
    this.setState({ droppingFile: true });
  };

  _onFileDropCancel = () => {
    this.setState({ droppingFile: false });
  };

  _onFileDrop = (files) => {
    this._onFileDropCancel();
    let file = files[0];
    let samples = getAudioDataFromWAV(file);
    this._attachTrack(new StaticTrack(samples, SAMPLE_RATE));
  };

  _onNextMicData = (micData) => {
    this.liveTrack.appendSamples(micData.samples);
  };

  _onTimeUpdate = (currentTime, startTime, endTime, lastTime) => {
    if (!this.state.playing) {
      return;
    }
    let samples = this.state.track.getSamples(lastTime, currentTime);
    let wavData = new Int16Array(samples.length);
    wavData.set(samples);
    let micData = {
      numChannels: 1,
      bytesPerSample: 2,
      sampleRate: this.state.track.sampleRate,
      samples: wavData,
    };
    this.refs.wavPlayer.appendBuffer(makeWAVFromMicData(micData));
  };

  _onSelectColorModel = (e) => {
    this.setState({ colorModel: this.refs.colorModel.getValue() });
  };

  _onChangeGridDrawing = (e) => {
    this.setState({ drawGrid: this.refs.drawGrid.getChecked() });
  };
  
  _togglePlayback = () => {
    this.setState({ playing: !this.state.playing });
  };

  render() {
    let buttonGlyph = this.state.playing ? 'volume-off' : 'volume-up';
    // TODO: get sampleRate from global audio configuration
    return (
      <div>
        <ButtonGroup>
          <Button onClick={this._togglePlayback}>
            <Glyphicon glyph={buttonGlyph} />
          </Button>
        </ButtonGroup>
        <AudioVisualizer
          ref="visualizer"
          track={this.state.track}
          fftSize={FFT_SIZE}
          windowOverlap={WINDOW_OVERLAP}
          spectrogramFrames={SPECTROGRAM_FRAMES}
          graphWidth={1024}
          graphHeight={512}
          colorModel={this.state.colorModel}
          drawGrid={this.state.drawGrid}
        />
        <ButtonGroup style={{display: 'flex', flexDirection:'horizontal'}}>
          <Input
            ref="colorModel"
            type="select"
            label="Color Model"
            placeholder="jet"
            onChange={this._onSelectColorModel}>
            <option value="jet">Jet</option>
            <option value="hsv">HSV</option>
            <option value="grayscale">None (grayscale)</option>
          </Input>
          <Input
            ref="drawGrid"
            type="checkbox"
            label="Draw Grid"
            onChange={this._onChangeGridDrawing}
          />
        </ButtonGroup>
        <GaplessWAVPlayer ref="wavPlayer" />

        <FileDrop
          onStart={this._onFileDropStart}
          onCancel={this._onFileDropCancel}
          onDrop={this._onFileDrop}
        />
        <Lightbox visible={this.state.droppingFile} />
      </div>
    );
  }
}
