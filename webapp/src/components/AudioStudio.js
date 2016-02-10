import React from 'react';
import { Button, Glyphicon } from 'react-bootstrap';

import Cameras from '../libraries/Cameras';
import GaplessWAVPlayer from './GaplessWAVPlayer';

function makeWAVFromMicData(micData) {
  let { numChannels, bytesPerSample, sampleRate, samples } = micData;
  samples = new Buffer(samples);

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

export default class AudioStudio extends React.Component {
  state = {
    camera: null,
    playing: true,
  };

  get deviceId() {
    return this.props.params.deviceId;
  }

  componentDidMount() {
    Cameras.on('stateChanged', this._onCamerasStateChanged);
    this._onCamerasStateChanged(Cameras);
  }

  componentWillUnmount() {
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

  _onNextMicData = (micData) => {
    if (this.state.playing) {
      this.refs.wavPlayer.appendBuffer(makeWAVFromMicData(micData));
    }
  };

  _togglePlayback = () => {
    this.setState({ playing: !this.state.playing });
  };

  render() {
    let buttonGlyph = this.state.playing ? 'pause' : 'play';
    return (
      <div>
        <Button onClick={this._togglePlayback}>
          <Glyphicon glyph={buttonGlyph} />
        </Button>
        <GaplessWAVPlayer ref="wavPlayer" />
      </div>
    );
  }
}
