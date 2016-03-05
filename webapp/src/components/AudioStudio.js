import config from 'silk-config';
import createLog from 'silk-log';
import React from 'react';
import { Button, ButtonGroup, Glyphicon, Input,
         Modal, OverlayTrigger, Panel, Popover } from 'react-bootstrap';
import path from 'path';
import svmjs from 'svm';
import tar from 'tar-stream';

import AudioVisualizer from './AudioVisualizer';
import Cameras from '../libraries/Cameras';
import ClapDetectorSVM from '../libraries/ClapDetectorSVM';
import createAudioAnalyzer from '../libraries/AudioAnalyzer';
import FileDrop from './FileDrop';
import Files from '../libraries/Files';
import { LiveTrack, StaticTrack } from '../libraries/AudioTrack';
import GaplessWAVPlayer from './GaplessWAVPlayer';
import Lightbox from './Lightbox';

const log = createLog('AudioStudio');

function forEachFileInTAR(tag, fileData, forEach) {
  return new Promise((resolve, reject) => {
    let extract = tar.extract();
    extract.on('entry', (header, stream, nextEntry) => {
      readEntireStream(stream)
        .then((data) => forEach(tag, header, data))
        .then(() => nextEntry());
    });
    extract.on('finish', () => resolve());
    extract.end(new Buffer(fileData));
  });
}

function getAudioDataFromWAV(wav) {
  // TODO: validate WAV format etc.
  return new Int16Array(wav.buffer.slice(44));
}

function isBenchmarkTAR(name) {
  return name === 'benchmark.tar';
}

function isClapEvent(testName) {
  return testName.split('-')[0] === 'clap'
}

function isTARFilename(name) {
  return name.endsWith('.tar');
}

function isWAVFilename(name) {
  return name.endsWith('.wav');
}

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

function makeWAVFromMicData(samples, params = config.deviceMic) {
  samples = new Buffer(samples.buffer);
  let hdr = makeWAVHeader(params, samples.length);
  let wav = Buffer.concat([ hdr, samples ]);
  return wav.toArrayBuffer();
}

function readEntireStream(stream) {
  return new Promise((resolve, reject) => {
    let buffer = new Buffer(0);
    stream.on('data', (data) => buffer = Buffer.concat([ buffer, data ]));
    stream.on('end', () => resolve(buffer));
  });
}

function zeroPad(number, width) {
  let string = number.toString();
  if (string.length < width) {
    string = '0'.repeat(width - string.length) + string;
  }
  return string;
}

const FFT_SIZE = 512;
const WINDOW_OVERLAP = 256;
const SPECTROGRAM_FRAMES = 64;

const LOUD_SOUND_THRESHOLD_DB = -40;
const LOUD_SOUND_THRESHOLD_LINEAR = 0.01;
const LOUD_SOUND_START_PAD = 0.256;
const LOUD_SOUND_MIN_DURATION = 0.512;

const PREF_FILE = 'prefs.json';
const DEFAULT_PREFS = {
  colorModel: 'jet',
  drawGrid: false,
  graphView: 'spectLinear',
};

const clapSVMConfig = {
  model: 'clap-svm.json',
  // This defines which FFT result type we'll use for SVM
  // classification.  It's been found empirically that linear magnitudes
  // are much more discriminative than decibel magnitudes (which aren't
  // discriminative with basic SVM params).  This is most likely because
  // linear magnitudes are "more normalized" than log-decibel, but no
  // effort was spent investigating this.
  fftType: 'fftMagnitudeLinear',
  loudThreshold: LOUD_SOUND_THRESHOLD_LINEAR,
  fftSize: 512,
  windowOverlap: 256,
  // How many consecutive FFT frames we collect for the loud sound
  // that we're going to classify.  This is a magic number created by
  // eyeballing the spectrograms of some recorded clap sounds.  16 is
  // about a quarter second of (overlapped) spectrogram frames with
  // 16KHz sampling and the FFT params above, and is short enough that
  // fairly quick repeated clappings can be reliably detected (but not
  // /really/ quick ones).  No effort has been made to optimize this
  // value.
  featureVectorFrameCount: 16,
  sampleRate: config.deviceMic.sampleRate,
  sampleMin: config.deviceMic.sampleMin,
  sampleMax: config.deviceMic.sampleMax,
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
    let duration = '';
    if (this.props.stats) {
      let sampleRate = parseInt(config.deviceMic.sampleRate);
      duration = ((this.props.stats.size - 44) / 2 / sampleRate).toFixed(3) + 'sec';
    }
    return (
      <Panel onClick={this._onClick}>
        <div>{this.props.name}</div>
        <div>{duration}</div>
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
    camera: null,
    droppingFile: false,
    playing: false,
    recording: '',              // { '', 'recording', 'set-name', 'saving' }
    recordingName: '',
    recordingMode: '',           // { '', 'human', 'auto', ...
    track: null,
  };
  prefs = DEFAULT_PREFS;
  files = null;
  liveTrack = null;
  loudSoundStartTime = 0.0;
  loudSoundLastDetectTime = 0.0;
  loudSoundEndTime = 0.0;
  recordingSamples = null;
  savedTracks = [ ];

  constructor() {
    super();
    this.files = new Files();
    this.files.read(PREF_FILE)
      .then((data) => this._setPrefs(JSON.parse(data)))
      .catch((err) => log.debug('(No prefs set yet)'));
    this._refreshSavedTracks();
  }

  get deviceId() {
    return this.props.params.deviceId;
  }

  componentWillMount() {
    this.liveTrack = new LiveTrack(SPECTROGRAM_FRAMES * FFT_SIZE,
                                   config.deviceMic.sampleRate);
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

      this.clapDetectorSVM.destructor();
      this.clapDetectorSVM = null;

    }
    if (track) {
      track.on('timeupdate', this._onTimeUpdate);

      this.clapDetectorSVM = new ClapDetectorSVM(track, clapSVMConfig);
      this.clapDetectorSVM.on('clap', this._onClapSVM);
    }
    this.setState({ track });
  }

  _finishRecording(why) {
    log.debug('Finishing recording because of', why,
                'got', this.recordingSamples.length, 'sample buffers');
    if (this.recordingSamples.length === 0) {
      log.info('(Nothing to save, bailing)');
      return;
    }
    let suggestedName = this._getNextIncrementalFileName();
    if (this.state.recordingMode === 'auto') {
      // Skip the set-name dialog box in auto mode ... skip right to
      // the saving.
      this._saveRecording(suggestedName, why);
      return;
    }
    this.setState({ recording: 'set-name',
                    recordingName: suggestedName });
    log.debug('Getting final recording name; suggesting', suggestedName);
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
    forEachFileInTAR('', file.data, (tag, header, fileData) => {
      this.files.write(header.name, fileData);
      log.info('Imported', header.name);
    })
      .then(() => this._refreshSavedTracks());
  }

  _loadTrackFile(filename) {
    return this.files.read(filename)
      .then((data) => {
        let samples = getAudioDataFromWAV(data);
        this._attachTrack(new StaticTrack(samples, config.deviceMic.sampleRate));
      })
      .catch((err) => log.error('Failed to read track', filename, err));
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

  _onClapSVM = (startTime) => {
    log.info('ClapDetectorSVM detected clap starting at', startTime);
  };

  _onFFTMagnitudeDecibel = (magnitudes, startTime, endTime) => {
    let isLoud = Math.max(...magnitudes) > LOUD_SOUND_THRESHOLD_DB;
    if (isLoud && this.loudSoundStartTime === 0.0) {
      // This is the first sample window that we heard the lound
      // sound.  Now we kick off recording, starting from just before
      // current time.
      //log.debug('Heard start of loud sound ...');
      this.loudSoundStartTime = this.loudSoundEndTime =
        startTime - LOUD_SOUND_START_PAD;
      if (this.state.recordingMode === 'auto'
          && this.state.recording === '') {
        this.recordingSamples = [ ];
        this.setState({ recording: 'recording' });
        log.info('  started auto-recording');
      }
    }
    if (this.loudSoundStartTime === 0.0) {
      // Nothing loud heard recently, keep listening.
      return;
    }

    // Add new samples to our recording.
    let lastEndTime = this.loudSoundEndTime;
    if (this.state.recordingMode === 'auto'
        && this.state.recording === 'recording') {
      let samples = this.state.track.getSamples(lastEndTime, endTime);
      let wavData = new Int16Array(samples.length);
      wavData.set(samples);
      this.recordingSamples.push(new Uint8Array(wavData.buffer));
    }
    this.loudSoundEndTime = endTime;

    if (isLoud) {
      this.loudSoundLastDetectTime = endTime;
    }
    if (endTime - this.loudSoundLastDetectTime > LOUD_SOUND_MIN_DURATION) {
      // Haven't heard a loud sound window for long enough, consider
      // the event as ended.
      //log.debug('  loud sound lasted',
      //          (endTime - this.loudSoundStartTime).toFixed(3));
      this.loudSoundStartTime = this.loudSoundLastDetectTime = 0.0;
      if (this.state.recordingMode === 'auto'
          && this.state.recording === 'recording') {
        this._finishRecording('end-of-loud-sound');
      }
    }
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
    if (isBenchmarkTAR(file.name)) {
      this._runBenchmark(file.data);
      return;
    }
    if (isTARFilename(file.name)) {
      this._importTar(file);
      return;
    }
    if (!isWAVFilename(file.name)) {
      log.warn(file.name, 'does not look like a WAV file, refusing to import it');
      return;
    }
    this.files.write(file.name, file.data)
      .then(() => {
        this._loadTrackFile(file.name);
        this._refreshSavedTracks();
      })
      .catch(() => log.error('Failed to save file', file.name));
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
      this.refs.wavPlayer.appendBuffer(makeWAVFromMicData(wavData));
    }
    if (this.state.recordingMode === 'human'
        && this.state.recording === 'recording') {
      let data = new Uint8Array(wavData.buffer);
      this.recordingSamples.push(data);
    }
  };

  _onDeleteTrack = (track) => {
    this.files.unlink(track.name)
      .then(() => this._refreshSavedTracks())
      .catch((err) => log.error('Failed to unlink()', track.name, err));
  };

  _onDeleteAllTracks = () => {
    Promise.all(this.savedTracks.map((track) => this.files.unlink(track.name)))
      .then(() => this._refreshSavedTracks())
      .catch((err) => log.error('Failed to unlink() all tracks', err));
  };

  _onDownloadTrack = (track) => {
    this.files.read(track.name)
      .then((data) => this._sendFileToUser(data))
      .catch((err) => log.error('Failed to download', track.name, err));
  };

  _onDownloadAllTracks = () => {
    let pack = tar.pack();
    return Promise.all(this.savedTracks.map((track) => (
      this.files.read(track.name)
        .then((data) => pack.entry({ name: track.name }, new Buffer(data)))
    )))
      .then(() => {
        pack.finalize();
        return readEntireStream(pack);
      })
      .then((data) => this._sendFileToUser(data))
      .catch((err) => log.error('Failed to send TAR', err));
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

  _onArmAutoRecording = () => {
    // In auto mode, we only *actually* start recording when a loud
    // sound is detected.  This call just arms the auto-recording
    // logic.
    this.setState({ recordingMode: 'auto' });
    log.debug('Entered auto-recording mode');
  };

  _onStartRecording = () => {
    this.recordingSamples = [ ];
    this.setState({ recordingMode: 'human', recording: 'recording' });
    log.debug('Starting human-triggered recording');
  };

  _onStopRecording = () => {
    if (!this.state.recording) {
      log.debug('No active recording, immediately exiting mode',
                this.state.recordingMode);
      this.setState({ recordingMode: '', recording: '' });
      return;
    }
    this._finishRecording('stop');
  };

  _onRecordingNameChange = () => {
    this.setState({ recordingName: this.refs.recordingName.getValue() });
  };

  _onSubmitRecordingName = () => {
    let name = this.refs.recordingName.getValue();
    if (!name.length) {
      log.debug('No name set');
      return;
    }
    // Whenever the user has explicitly set a recording name, it's
    // because of an explicit 'stop'.
    this._saveRecording(name, 'stop');
  };

  _onOpenLiveStream = () => {
    this._attachTrack(this.liveTrack);
  };

  get _playingLiveTrack() {
    return this.state.track === this.liveTrack;
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
      .catch((err) => log.error('Failed to fetch list of saved tracks'));
  }

  _runBenchmark(benchmarkTAR) {
    // The benchmark TAR has the following layout:
    //
    //  event1/
    //    foo.wav
    //    bar.tar -> { 00.wav, 01.wav }
    //  event2/
    //    000.wav
    //    001.wav
    //
    // Each folder within the TAR declares a type of sound event.
    // Within each folder can be individual .wav files, or .tar's of
    // multiple .wav files.ñ
    let clapperTest = require('../libraries/ClapperTester');
    let benchmark = {
      testsRun: 0,
      claps: 0,
      miss: [ ],
      falseAccept: [ ],
    };

    // We run through the set of benchmark tests below and extract the
    // first loud sound heard in each test.  From the extracted loud
    // sound, we compute a feature vector and record the test's label.
    let trainingData = [ ];
    let trainingLabels = [ ];
    let validationData = [ ];
    let validationLabels = [ ];

    let benchmarkStartMs = Date.now();
    log.info('Running benchmark ...');
    let runTestOrSuite = (tag, header, fileData) => {
      if (header.type !== 'file') {
        return Promise.resolve();
      }
      let dir = path.dirname(header.name);
      let leafName = path.basename(header.name);
      if (leafName.startsWith('._')) {
        return Promise.resolve();
      }
      if (isTARFilename(leafName)) {
        let subsuite = path.basename(leafName, '.tar');
        return forEachFileInTAR(`${dir}-${subsuite}`, fileData,
                                runTestOrSuite);
      }
      let testName = `${tag}-${header.name}`;
      let isClap = isClapEvent(testName);
      let samples = getAudioDataFromWAV(fileData);
      let detectedEvents = clapperTest(samples);

      // Now we run the loud-sound extraction on the test case.
      // (Clapper does its own version of this in the `clapperTest()`
      // call above.)
      let isValidationData;
      let analyzer = createAudioAnalyzer({
        fftSize: clapSVMConfig.fftSize,
        windowOverlap: clapSVMConfig.windowOverlap,
        sampleRate: config.deviceMic.sampleRate,
        sampleMin: config.deviceMic.sampleMin,
        sampleMax: config.deviceMic.sampleMax,
      });
      let featureVector = new
        Float32Array(analyzer.frequencyBinCount *
                     clapSVMConfig.featureVectorFrameCount);
      let vectorOffset = 0;
      let extractLoudSounds = (magnitudes) => {
        if (vectorOffset === 0) {
          let isLoud = Math.max(...magnitudes) > clapSVMConfig.loudThreshold;
          if (!isLoud) {
            return;
          }
        }
        featureVector.set(magnitudes, vectorOffset);
        vectorOffset += analyzer.frequencyBinCount;
        if (vectorOffset === featureVector.length) {
          analyzer.removeListener('fftMagnitudeDecibel', extractLoudSounds);
          let label = isClap ? 1 : -1;
          let forTraining = (Math.random() < 0.5);
          isValidationData = !forTraining;

          // Uncomment this to train the SVM on the entire data set.
          //forTraining = isValidationData = true;

          if (forTraining) {
            trainingData.push(featureVector);
            trainingLabels.push(testName);
          }
          if (isValidationData) {
            validationData.push(featureVector);
            validationLabels.push(testName);
          }
          // We've extracted all we need from the test case and don't
          // care about the rest of the samples that are going to be
          // processed. We don't have a convenient way to stop further
          // processing, so just throw an exception to pop back out to
          // `appendSamples()` code below.
          throw 'done';
        }
      };
      analyzer.on(clapSVMConfig.fftType, extractLoudSounds);
      let detectedLoudSound = false;
      try {
        analyzer.appendSamples(samples, 0);
      } catch (e) {
        if (e !== 'done') {
          throw e;
        }
        detectedLoudSound = true;
      }
      if (!detectedLoudSound) {
        throw `Failed to extract loud sound from clip ${testName}`;
      }
      if (!isValidationData) {
        // If this vector wasn't chosen for SVM validation, then we
        // won't count its result against the clapper tally either.
        // This allows the clapper results to be directly compared to
        // the SVM validation, although the fairness is debatable.
        return Promise.resolve();
      }
      // Add this test case to the clapper validation results.
      benchmark.testsRun += 1;
      if (benchmark.testsRun % 25 === 0) {
        log.info(`... test ${benchmark.testsRun}`);
      }
      let testId = (tag + '/' + leafName);
      let detectedClap = (detectedEvents.indexOf('clap') >= 0);
      if (isClap) {
        benchmark.claps += 1;
      }
      if (isClap && !detectedClap) {
        benchmark.miss.push(testId);
      }
      if (!isClap && detectedClap) {
        benchmark.falseAccept.push(testId);
      }
      return Promise.resolve();
    };
    // Extract all the WAV test cases out of this (recursive) TAR
    // file.
    forEachFileInTAR(null, benchmarkTAR, runTestOrSuite)
      .then(() => {
        let nrTests = benchmark.testsRun;
        let nrClaps = benchmark.claps;
        let nrNonClaps = nrTests - nrClaps;
        let nrDetected = nrClaps - benchmark.miss.length;
        let nrFalseAccepts = benchmark.falseAccept.length;
        let elapsedTimeSec = (Date.now() - benchmarkStartMs) / 1000;
        let msPerTest = 1000.0 * elapsedTimeSec / nrTests;
        log.info(`Ran ${nrTests} tests in ${elapsedTimeSec.toFixed(2)}s (${msPerTest.toFixed(1)}ms per test)`);
        log.info(`  detected ${nrDetected}/${nrClaps} claps and falsely accepted ${nrFalseAccepts}/${nrNonClaps} non-claps`);
        log.info(`  misses: ${benchmark.miss}`);
        log.info(`  false-accepts: ${benchmark.falseAccept}`);
      })
      .then(() => {
        this._trainSVM(trainingData, trainingLabels,
                       validationData, validationLabels,
                       (label) => isClapEvent(label) ? 1 : -1);
      });
  }

  _trainSVM(trainingData, trainingLabels, validationData, validationLabels,
            labelToSVMClass) {
    let svm = new svmjs.SVM();
    let options = {
      // Default `maxiter` is 1e4.  Raising it to 1e6 seems to produce
      // slightly better results, but not conclusively and not
      // formally.
      maxiter: 1e6,
      // These magic SVM params are the default for svmjs.
      C: 1e0,
      numpasses: 1e1,
      // Linear kernels are broken in svmjs, which is very concerning.
      //svmjs should not be used in production code, at least not for
      //training.
      //
      //kernel: 'linear',
      kernel: 'rbf',
      rbfsigma: 0.5,
      tol: 1e-4,
      alphatol: 1e-7,
    };

    let start;

    log.info(`Beginning training on ${trainingData.length} points ... this will take a while`);
    start = Date.now();
    svm.train(trainingData, trainingLabels.map(labelToSVMClass), options);
    let trainSecs = (Date.now() - start) / 1000;
    log.info(`  finished in ${trainSecs} seconds`);

    log.info(`Generating predictions on ${validationData.length} points ...`);
    start = Date.now();
    let predictions = svm.predict(validationData);
    let predictSecs = (Date.now() - start) / 1000;
    log.info(`  finished in ${predictSecs} seconds`);

    let nrTests = predictions.length;
    let nrClaps = 0;
    let nrNonClaps = 0;
    let miss = [ ];
    let falseAccept = [ ];
    for (let i = 0; i < validationLabels.length; ++i) {
      let label = validationLabels[i];
      let [ expected, actual ] = [ labelToSVMClass(label), predictions[i] ];
      if (expected === 1) {
        nrClaps++;
        if (actual !== expected) {
          miss.push(label);
        }
        continue;
      }
      if (expected === -1) {
        nrNonClaps++;
        if (actual !== expected) {
          falseAccept.push(label);
        }
        continue;
      }
      console.log('WTF', expected, actual);
      throw 'WTF';
    }
    let nrDetected = nrClaps - miss.length;
    let nrFalseAccepts = falseAccept.length;
    let msPerTest = 1000.0 * predictSecs / nrTests;
    log.info(`SVM ran ${nrTests} validations in predictions took ${predictSecs} seconds (${msPerTest.toFixed(1)}ms per test)`);
    log.info(`  detected ${nrDetected}/${nrClaps} claps and falsely accepted ${nrFalseAccepts}/${nrNonClaps} non-claps`);
    log.info(`  params: C:${options.C} maxiter:${options.maxiter} rbfsigma:${options.rbfsigma} numpasses:${options.numpasses}`);
    log.info(`  misses: ${miss}`);
    log.info(`  false-accepts: ${falseAccept}`);

    let json = svm.toJSON();
    let svm2 = new svmjs.SVM();
    svm2.fromJSON(json);
    let differentPrediction = false;
    let predictions2 = svm2.predict(validationData);
    for (let i = 0; i < predictions.length; ++i) {
      if (predictions[i] !== predictions2[i]) {
        console.log('FAIL');
        differentPrediction = true;
      }
    }
    if (differentPrediction) {
      throw 'JSON exported SVM failed to match original SVM';
    }
    log.info(`Exporting trained SVM to new window ...`);
    this._sendFileToUser(JSON.stringify(json));
  }

  _saveRecording(name, why) {
    name += '.wav';
    log.info(`Saving recording to name ${name}`);
    this.setState({ recording: 'saving' });
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
        // If a stop was explicitly requested, exit the recording
        // mode.  Otherwse don't change anything.
        let nextMode = (why === 'stop') ? '' : this.state.recordingMode;
        this.setState({ recording: '',
                        recordingMode: nextMode });
        log.debug(' ... finished writing because of', why, 'entering idle state and mode', nextMode);
        this._refreshSavedTracks();
      })
      .catch((err) => {
        log.error('Error writing recording file:', err);
      });
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
      .then(() => log.debug('Updated prefs'))
      .catch((err) => log.error('Error saving prefs', err));
  }

  _togglePlayback = () => {
    this.setState({ playing: !this.state.playing });
  };

  render() {
    let setRecordingNameOverlay = (
      <Modal show={this.state.recording === 'set-name'}>
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

    let savingRecordingOverlay = (
      <Modal show={this.state.recording === 'saving'}>
        <Modal.Header>
          <Modal.Title>Saving recording ...</Modal.Title>
        </Modal.Header>
      </Modal>
    );

    let muteUnmuteGlyph = this.state.playing ? 'volume-off' : 'volume-up';
    let filePicker = null;
    if (!this.state.recordingMode) {
      filePicker = (
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
      );
    }
    let recordButton = null;
    if (this._playingLiveTrack && !this.state.recordingMode) {
      recordButton = (
        <Button title="Record live stream" onClick={this._onStartRecording}>
          <Glyphicon glyph="record" />
        </Button>
      );
    }
    let autoRecordButton = null;
    if (this._playingLiveTrack && !this.state.recordingMode) {
      autoRecordButton = (
        <Button
          title="Auto-record loud noises in live stream"
          onClick={this._onArmAutoRecording}>
          <Glyphicon glyph="repeat" />
        </Button>
      );
    }
    let stopButton = null;
    if (this.state.recordingMode) {
      stopButton = (
        <Button title="Stop recording" onClick={this._onStopRecording}>
          <Glyphicon glyph="stop" />
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
              sampleMin={config.deviceMic.sampleMin}
              sampleMax={config.deviceMic.sampleMax}
              spectrogramFrames={SPECTROGRAM_FRAMES}
              graphWidth={1024}
              graphHeight={512}
              colorModel={this.state.colorModel}
              drawGrid={this.state.drawGrid}
              onFFTMagnitudeDecibel={this._onFFTMagnitudeDecibel}
            />
            <ButtonGroup>
              <Button onClick={this._togglePlayback}>
                <Glyphicon glyph={muteUnmuteGlyph} />
              </Button>
            </ButtonGroup>
            <ButtonGroup>
              {filePicker}
              {goLiveButton}
            </ButtonGroup>
            <ButtonGroup>
              {recordButton}
              {autoRecordButton}
              {stopButton}
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
        {setRecordingNameOverlay}
        {savingRecordingOverlay}
      </div>
    );
  }
}
