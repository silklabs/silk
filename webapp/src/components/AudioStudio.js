import React from 'react';
import { Button, ButtonGroup, Glyphicon, Input,
         Modal, OverlayTrigger, Panel, Popover } from 'react-bootstrap';
import tar from 'tar-stream';

import AudioVisualizer from './AudioVisualizer';
import Cameras from '../libraries/Cameras';
import FileDrop from './FileDrop';
import Files from '../libraries/Files';
import { LiveTrack, StaticTrack } from '../libraries/AudioTrack';
import GaplessWAVPlayer from './GaplessWAVPlayer';
import Lightbox from './Lightbox';

function makeWAVHeader(params, samplesLength) {
  let { numChannels, bytesPerSample, sampleRate } = params;
  let dataSize = samplesLength;
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
  return hdr;
}

function makeWAVFromMicData(micData) {
  let { samples } = micData;
  samples = new Buffer(samples.buffer);
  let hdr = makeWAVHeader(micData, samples.length);
  let wav = Buffer.concat([ hdr, samples ]);
  return wav.toArrayBuffer();
}

function getAudioDataFromWAV(wav) {
  // TODO: validate WAV format etc.
  let data = wav.slice(44).buffer;
  return new Int16Array(data);
}

function isTARFilename(name) {
  return name.endsWith('.tar');
}

function isWAVFilename(name) {
  return name.endsWith('.wav');
}

function zeroPad(number, width) {
  let string = number.toString();
  if (string.length < width) {
    string = '0'.repeat(width - string.length) + string;
  }
  return string;
}

const SAMPLE_RATE = 8000;
const FFT_SIZE = 256;
const WINDOW_OVERLAP = 128;
const SPECTROGRAM_FRAMES = 64;

const PREF_FILE = 'prefs.json';
const DEFAULT_PREFS = {
  colorModel: 'jet',
  drawGrid: false,
  graphView: 'spectLinear',
};

class TrackFile extends React.Component {
  _onClick = (e) => {
    if (this.props.onPick) {
      this.props.onPick(this.props);
    }
  };

  _onDelete = (e) => {
    e.stopPropagation();
    this.props.onDelete(this.props);
  };

  _onDownload = (e) => {
    e.stopPropagation();
    this.props.onDownload(this.props);
  };

  render() {
    let size = '';
    if (this.props.stats) {
      size = (this.props.stats.size / 1000).toFixed(2) + 'KB';
    }
    return (
      <Panel onClick={this._onClick}>
        <div>{this.props.name}</div>
        <div>{size}</div>
        <ButtonGroup>
          <Button onClick={this._onDownload}>
            <Glyphicon glyph="download" />
          </Button>
          <Button bsStyle="danger" onClick={this._onDelete}>
            <Glyphicon glyph="trash" />
          </Button>
        </ButtonGroup>
      </Panel>
    );
  }
}

class TrackPicker extends React.Component {
  _onDeleteAll = () => {
    let result = window.confirm('Really, delete all the tracks?'); //eslint-disable-line no-alert
    if (!result) {
      return;
    }
    this.props.onDeleteAll();
  };

  render() {
    let trackFiles = this.props.tracks.map((track) => (
      <TrackFile
        key={track.path}
        onDelete={this.props.onDelete}
        onDownload={this.props.onDownload}
        onPick={this.props.onPick}
        {...track}
      />
    ));
    trackFiles.unshift(
      <TrackFile
        key="all"
        name="(All)"
        onDelete={this._onDeleteAll}
        onDownload={this.props.onDownloadAll}
      />
    );
    return (
      <div style={{ display: 'flex', flexDirection: 'horizontal' }}>
        {trackFiles}
      </div>
    );
  }
}

export default class AudioStudio extends React.Component {
  state = {
    awaitingRecordingName: false,
    camera: null,
    droppingFile: false,
    playing: false,
    recording: false,
    recordingName: '',
    savingRecording: false,
    track: null,
  };
  prefs = DEFAULT_PREFS;
  files = null;
  liveTrack = null;
  recordingSamples = null;
  savedTracks = [ ];

  constructor() {
    super();
    this.files = new Files();
    this.files.read(PREF_FILE)
      .then((data) => this._setPrefs(JSON.parse(data)))
      .catch((err) => console.log('(No prefs set yet)'));
    this._refreshSavedTracks();
  }

  get deviceId() {
    return this.props.params.deviceId;
  }

  componentWillMount() {
    this.liveTrack = new LiveTrack(SPECTROGRAM_FRAMES * FFT_SIZE, SAMPLE_RATE);
    this._attachTrack(this.liveTrack);
    this.state.track = this.liveTrack;
    // We may still be loading prefs from file, but in that case state
    // will directly be updated when that finishes.
    Object.assign(this.state, this.prefs);
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
      this.state.track.stop();
      this.state.track.removeListener('timeupdate', this._onTimeUpdate);
    }
    if (track) {
      track.on('timeupdate', this._onTimeUpdate);
    }
    this.setState({ track });
  }

  _finishRecording() {
    console.log('Finishing recording, got', this.recordingSamples.length, 'sample buffers');
    if (this.recordingSamples.length === 0) {
      console.log('(Nothing to save, bailing)');
      return;
    }
    this.setState({ awaitingRecordingName: true,
                    recording: false,
                    recordingName: this._getNextIncrementalFileName() });
  }

  _getNextIncrementalFileName() {
    let max = this.savedTracks.reduce((accum, track) => {
      if (!/^\d{5}.wav$/.test(track.name)) {
        return accum;
      }
      // A little sneaky ... we rely on `parseInt('00001.wav') -> 1`.
      return Math.max(accum, parseInt(track.name));
    }, -1);
    return zeroPad(max + 1, 5);
  }

  _importTar(file) {
    let extract = tar.extract();
    extract.on('entry', (header, stream, callback) => {
      this._readEntireStream(stream)
        .then((data) => this.files.write(header.name, data))
        .then(() => callback())
        .catch((err) => console.error('Error extracting TAR', err));
    });
    extract.on('finish', () => this._refreshSavedTracks());
    extract.end(new Buffer(file.data));
  }

  _loadTrackFile(filename) {
    return this.files.read(filename)
      .then((data) => {
        let samples = getAudioDataFromWAV(data);
        this._attachTrack(new StaticTrack(samples, SAMPLE_RATE));
      })
      .catch((err) => {
        console.error('Failed to read track', filename, err);
      });
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
    if (isTARFilename(file.name)) {
      this._importTar(file);
      return;
    }
    if (!isWAVFilename(file.name)) {
      console.warn(file.name, 'does not look like a WAV file, refusing to import it');
      return;
    }
    this.files.write(file.name, file.data)
      .then(() => {
        this._loadTrackFile(file.name);
        this._refreshSavedTracks();
      })
      .catch(() => console.error('Failed to save file', file.name));
  };

  _onNextMicData = (micData) => {
    this.liveTrack.appendSamples(micData.samples);
  };

  _onTimeUpdate = (currentTime, startTime, endTime, lastTime) => {
    if (!(this.state.playing || this.state.recording)) {
      return;
    }
    let samples = this.state.track.getSamples(lastTime, currentTime);
    let wavData = new Int16Array(samples.length);
    wavData.set(samples);
    if (this.state.playing) {
      // TODO: don't hard-code this
      let micData = {
        numChannels: 1,
        bytesPerSample: 2,
        sampleRate: this.state.track.sampleRate,
        samples: wavData,
      };
      this.refs.wavPlayer.appendBuffer(makeWAVFromMicData(micData));
    }
    if (this.state.recording) {
      let data = new Uint8Array(wavData.buffer);
      this.recordingSamples.push(data);
    }
  };

  _onDeleteTrack = (track) => {
    this.files.unlink(track.name)
      .then(() => this._refreshSavedTracks())
      .catch((err) => console.error('Failed to unlink()', track.name, err));
  };

  _onDeleteAllTracks = () => {
    Promise.all(this.savedTracks.map((track) => this.files.unlink(track.name)))
      .then(() => this._refreshSavedTracks())
      .catch((err) => console.error('Failed to unlink() all tracks', err));
  };

  _onDownloadTrack = (track) => {
    this.files.read(track.name)
      .then((data) => this._sendFileToUser(data))
      .catch((err) => console.error('Failed to download', track.name, err));
  };

  _onDownloadAllTracks = () => {
    let pack = tar.pack();
    return Promise.all(this.savedTracks.map((track) => (
      this.files.read(track.name)
        .then((data) => pack.entry({ name: track.name }, new Buffer(data)))
    )))
      .then(() => {
        pack.finalize();
        return this._readEntireStream(pack);
      })
      .then((data) => this._sendFileToUser(data))
      .catch((err) => console.error('Failed to send TAR', err));
  };

  _onPickTrack = (track) => {
    this.refs.pickerTrigger.hide();
    this._loadTrackFile(track.name);
  };

  _onSelectGraphView = (e) => {
    this._setPrefs({ graphView: this.refs.graphView.getValue() });
  };

  _onSelectColorModel = (e) => {
    this._setPrefs({ colorModel: this.refs.colorModel.getValue() });
  };

  _onChangeGridDrawing = (e) => {
    this._setPrefs({ drawGrid: this.refs.drawGrid.getChecked() });
  };

  _onRecordingNameChange = () => {
    this.setState({ recordingName: this.refs.recordingName.getValue() });
  };

  _onSubmitRecordingName = () => {
    let name = this.refs.recordingName.getValue();
    if (!name.length) {
      console.log('No name set');
      return;
    }
    name += '.wav';
    console.log('Writing recording with name', name);
    this.setState({ awaitingRecordingName: false, savingRecording: true });
    // TODO: don't hard-code these
    let audioParams = {
      numChannels: 1,
      bytesPerSample: 2,
      sampleRate: this.state.track.sampleRate,
    };
    let totalSampleBytes = this.recordingSamples.reduce(
      (accum, data) => {
        return accum + data.length;
      }, 0);
    let wavHeader = makeWAVHeader(audioParams, totalSampleBytes);
    this.recordingSamples.unshift(wavHeader.toArrayBuffer());
    this.files.writev(name, this.recordingSamples)
      .then(() => {
        console.log(' ... finished writing');
        this.setState({ savingRecording: false });
        this._refreshSavedTracks();
      })
      .catch((err) => {
        console.error('Error writing recording file:', err);
      });
  };

  _onOpenLiveStream = () => {
    this._attachTrack(this.liveTrack);
  };

  get _playingLiveTrack() {
    return this.state.track === this.liveTrack;
  }

  _readEntireStream(stream) {
    return new Promise((resolve, reject) => {
      let buffer = new Buffer(0);
      stream.on('data', (data) => buffer = Buffer.concat([ buffer, data ]));
      stream.on('end', () => resolve(buffer));
    });
  }

  _refreshSavedTracks() {
    this.files.enumerate()
      .then((files) => Promise.all(files.map((file) => this.files.stat(file))))
      .then((files) => {
        this.savedTracks = files.filter((file) => isWAVFilename(file.name));
        // Sort descending by access time.
        this.savedTracks.sort((a, b) => b.stats.atime - a.stats.atime);
        // TODO: we should efficiently store `savedTracks` in this.state
        this.forceUpdate();
      })
      .catch((err) => console.log('Failed to fetch list of saved tracks'));
  }

  _sendFileToUser(data) {
    let blob = new Blob([ data ]);
    let url = URL.createObjectURL(blob);
    window.open(url);
    URL.revokeObjectURL(url);
  }

  _setPrefs(newPrefs) {
    Object.assign(this.prefs, newPrefs);
    this.setState(this.prefs);
    this.files.write(PREF_FILE, JSON.stringify(this.prefs))
      .then(() => console.log('Updated prefs'))
      .catch((err) => console.log('Error saving prefs', err));
  }

  _togglePlayback = () => {
    this.setState({ playing: !this.state.playing });
  };

  _toggleRecording = () => {
    let recording = !this.state.recording;
    this.setState({ recording });
    if (recording) {
      console.log('Starting recording ...');
      this.recordingSamples = [ ];
    } else {
      this._finishRecording();
    }
  };

  render() {
    if (this.state.awaitingRecordingName) {
      return (
        <Modal show={true}>
          <Modal.Body>
            <Input
              ref="recordingName"
              type="text"
              label="Name the recording"
              value={this.state.recordingName}
              onChange={this._onRecordingNameChange}
            /> .wav
          </Modal.Body>
          <Modal.Footer>
            <Button onClick={this._onSubmitRecordingName}>
              Submit
            </Button>
          </Modal.Footer>
        </Modal>
      );
    }
    if (this.state.savingRecording) {
      return (
        <Modal show={true}>
          <Modal.Header>
            <Modal.Title>Saving recording ...</Modal.Title>
          </Modal.Header>
        </Modal>
      );
    }
    let muteUnmuteGlyph = this.state.playing ? 'volume-off' : 'volume-up';
    let recordButton = null;
    if (this._playingLiveTrack) {
      let recordStopGlyph = this.state.recording ? 'stop' : 'record';
      recordButton = (
        <Button title="Record live stream" onClick={this._toggleRecording}>
          <Glyphicon glyph={recordStopGlyph} />
        </Button>
      );
    }
    let goLiveButton = null;
    if (!this._playingLiveTrack) {
      goLiveButton = (
        <Button title="Open live stream" onClick={this._onOpenLiveStream}>
          <Glyphicon glyph="fast-forward" />
        </Button>
      );
    }
    // TODO: get sampleRate from global audio configuration
    return (
      <div style={{padding: '5px'}}>
        <div style={{display: 'flex', flexDirection: 'horizontal'}}>
          <div>
            <AudioVisualizer
              ref="visualizer"
              graphView={this.state.graphView}
              track={this.state.track}
              fftSize={FFT_SIZE}
              windowOverlap={WINDOW_OVERLAP}
              spectrogramFrames={SPECTROGRAM_FRAMES}
              graphWidth={1024}
              graphHeight={512}
              colorModel={this.state.colorModel}
              drawGrid={this.state.drawGrid}
            />
            <ButtonGroup>
              <OverlayTrigger
                ref="pickerTrigger"
                trigger="click"
                placement="top"
                rootClose={true}
                overlay={<Popover title="Open a track">
                           <TrackPicker
                             onDelete={this._onDeleteTrack}
                             onDeleteAll={this._onDeleteAllTracks}
                             onDownload={this._onDownloadTrack}
                             onDownloadAll={this._onDownloadAllTracks}
                             onPick={this._onPickTrack}
                             tracks={this.savedTracks}
                           />
                         </Popover>}>
                <Button>
                  <Glyphicon glyph="folder-open" />
                </Button>
              </OverlayTrigger>
            </ButtonGroup>
            <ButtonGroup>
              <Button onClick={this._togglePlayback}>
                <Glyphicon glyph={muteUnmuteGlyph} />
              </Button>
            {recordButton}
            {goLiveButton}
            </ButtonGroup>
          </div>
          <ButtonGroup style={{paddingLeft: '5px'}}>
            <Input
              ref="graphView"
              type="select"
              label="Graph View"
              value={this.state.graphView}
              onChange={this._onSelectGraphView}>
              <option value="spectLinear">Spectrogram (Linear)</option>
              <option value="spectDecibel">Spectrogram (Decibel)</option>
              <option value="freqLinear">Frequency Domain (Linear)</option>
              <option value="freqDecibel">Frequency Domain (Decibel)</option>
              <option value="time">Time Domain</option>
            </Input>
            <Input
              ref="colorModel"
              type="select"
              label="Color Model"
              value={this.state.colorModel}
              onChange={this._onSelectColorModel}>
              <option value="jet">Jet</option>
              <option value="hsv">HSV</option>
              <option value="grayscale">None (grayscale)</option>
            </Input>
            <Input
              ref="drawGrid"
              type="checkbox"
              label="Draw Grid"
              checked={this.state.drawGrid}
              onChange={this._onChangeGridDrawing}
            />
          </ButtonGroup>
        </div>
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
