import config from 'silk-config';
import { createAudioAnalyzer, createSoundDetectorSVM,
         LOUD_SOUND_THRESHOLD_DB,
         parsePackedSVMModel,
         svmFFTConfig, svmSoundsConfigs } from 'silk-audio';
import createLog from 'silk-log';
import React from 'react';
import { Button, ButtonGroup, Glyphicon, Input,
         Modal, OverlayTrigger, Panel, Popover } from 'react-bootstrap';
import path from 'path';
import tar from 'tar-stream';

import AudioVisualizer from './AudioVisualizer';
import Cameras from '../libraries/Cameras';
// This is a private API, but we're "friends" with the sound-event
// recognition code.
import FeatureVectorExtractor from '../../../audio/lib/FeatureVectorExtractor';
import FileDrop from './FileDrop';
import Files from '../libraries/Files';
import { trainSVM } from '../libraries/SVMTrainer';
import { LiveTrack, StaticTrack } from '../libraries/AudioTrack';
import GaplessWAVPlayer from './GaplessWAVPlayer';
import Lightbox from './Lightbox';

const log = createLog('AudioStudio');

function generateGridSearchTrainingOptions(params) {
  let options = [ { } ];
  Object.keys(params).forEach((param) => {
    let values = params[param];
    let newOptions = [ ];
    options.forEach((option) => {
      values.forEach((value) => {
        let newOption = Object.assign({}, option);
        newOption[param] = value;
        newOptions.push(newOption);
      });
    });
    options = newOptions;
  });
  return options;
}

const svmToTrain = svmSoundsConfigs.firealarm;
const svmTrainingConfig = {
  svmConfig: svmToTrain,
  mode: 'cross-validate',
  //mode: 'full',
  reportFailedTests: true,

  // For 'full' training mode --- SVM ready to ship.  Options gathered
  // and updated from a satisfactory cross-validate grid search.
  options: svmToTrain.trainingOptions,

  // For 'cross-validate' training mode --- grid-search the param
  // space.
  optionsList: generateGridSearchTrainingOptions({
    rbfsigma: [ 0.1 ],
    C: [ 1e0 ],

    maxiter: [ 1e4 ],
    numpasses: [ 1e1 ],

    // These won't vary.
    kernel: [ 'rbf' ],
    tol: [ 1e-4 ],
    alphatol: [ 1e-7 ],
  }),
};
const ENABLE_SOUND_DETECTOR = true;

const FFT_SIZE = 512;
const WINDOW_OVERLAP = 256;
const SPECTROGRAM_FRAMES = 64;

const LOUD_SOUND_START_PAD = 0.256;

const PREF_FILE = 'prefs.json';
const DEFAULT_PREFS = {
  colorModel: 'jet',
  drawGrid: false,
  graphView: 'spectLinear',
};

let loadedSVMConfigs = null;
let loadingPromise = null;

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

function isTARFilename(name) {
  return name.endsWith('.tar');
}

function isWAVFilename(name) {
  return name.endsWith('.wav');
}

function loadModel(cfg) {
  return fetch(cfg.model)
    .then((response) => response.arrayBuffer())
    .then((arrayBuffer) => {
      cfg.model = parsePackedSVMModel(arrayBuffer);
    })
    .catch((err) =>
           log.error(`Failed to fetch model ${cfg.model}: ${err}`));
}

function loadSVMModels() {
  if (loadedSVMConfigs) {
    return Promise.resolve(loadedSVMConfigs);
  }
  if (loadingPromise) {
    return loadingPromise;
  }
  let cfgs = { };
  Object.assign(cfgs, svmSoundsConfigs);
  loadingPromise = Promise.all(Object.keys(cfgs).map((key) => {
    let cfg = cfgs[key];
    return loadModel(cfg);
  }))
    .then(() => {
      log.info('Loaded all models');
      loadedSVMConfigs = cfgs;
      loadingPromise = null;
      return Promise.resolve(loadedSVMConfigs);
    })
    .catch(() => {
      // There's not much we can do if the models fail to load.  This
      // catch() will set things up so that when loading a new track,
      // we'll try again.  (But probably will fail again.)
      loadingPromise = null;
    });
  return loadingPromise;
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

/**
 * Return the value of the maximum element of `array`.
 *
 * A naive grasshopper might be tempted to write something like
 * `Math.max(...array)`, but that would be foolish indeed.  Something
 * pathological in the spread-operator translation causes that
 * expression to run ~200x slower than this loop on device.
 *
 * TODO: share with silk-audio `max()`.
 */
function max(array) {
  let maxValue = -Infinity;
  for (let i = 0; i < array.length; ++i) {
    maxValue = Math.max(array[i], maxValue);
  }
  return maxValue;
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
  soundDetector = null;

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

    if (Notification.permission !== 'granted'
        && Notification.permission !== 'denied') {
      Notification.requestPermission((result) => (
        log.info('User chose notification permissions:', result)));
    } else {
      log.info(`Notification permission is already ${Notification.permission}`);
    }
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
      if (this.soundDetector) {
        this.soundDetector.destructor();
        this.soundDetector = null;
      }
    }
    if (track) {
      track.on('timeupdate', this._onTimeUpdate);

      if (ENABLE_SOUND_DETECTOR) {
        loadSVMModels().then((svmCfgs) => {
          this.soundDetector = createSoundDetectorSVM(svmFFTConfig, svmCfgs);
          this.soundDetector.on('sound', this._onSoundEvent);
        });
      }
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

  _onSoundEvent = (e) => {
    if (!e.endTime) {
      log.info(`Heard ${e.soundClass} (starting at ${e.startTime.toFixed(3)})`);
    } else {
      log.info(` ... end of ${e.soundClass} after ${(e.endTime - e.startTime).toFixed(3)}`);
    }
  };

  _onFFTMagnitudeDecibel = (magnitudes, startTime, endTime) => {
    let isLoud = max(magnitudes) > LOUD_SOUND_THRESHOLD_DB;
    if (isLoud && this.loudSoundStartTime === 0.0) {
      // This is the first sample window that we heard the lound
      // sound.  Now we kick off recording, starting from just before
      // current time.
      log.debug('Heard start of loud sound ...');
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
    if (endTime - this.loudSoundLastDetectTime > svmTrainingConfig.svmConfig.loudMinDuration) {
      // Haven't heard a loud sound window for long enough, consider
      // the event as ended.
      log.debug('  loud sound lasted',
                (endTime - this.loudSoundStartTime).toFixed(3));
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
    let samples = this.state.track.getSamples(lastTime, currentTime);
    if (this.soundDetector) {
      this.soundDetector.appendSamples(samples, lastTime);
    }

    if (!(this.state.playing || this.state.recording)) {
      return;
    }
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
    // multiple .wav files.
    //
    // We run through the set of benchmark tests below and extract the
    // first loud sound heard in each test.  From the extracted loud
    // sound, we compute a feature vector and record the test's label.
    let svmConfig = svmTrainingConfig.svmConfig;
    let trainingData = [ ];
    let trainingLabels = [ ];
    let validationData = [ ];
    let validationLabels = [ ];
    let failedClips = [ ];
    let nrSounds = 0;

    log.info(`Extracting training and validation sounds with feature vector frame count ${svmConfig.featureVectorFrameCount} ...`);
    let extractionStart = Date.now();
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
      let featureVectorCount = 0;
      let samples = getAudioDataFromWAV(fileData);

      // Run loud-sound extraction on the test case.
      let analyzer = createAudioAnalyzer(svmFFTConfig);
      let featureVectorExtractor =
            new FeatureVectorExtractor(analyzer, svmConfig);

      class DoneException extends Error {}

      featureVectorExtractor.on('loud-sound', (featureVector) => {
        let featureVectorLabel = testName + '-' + featureVectorCount++;
        let forTraining, forValidation;
        if (svmTrainingConfig.mode === 'full') {
          forTraining = forValidation = true;
        } else {
          // Arbitrarily choose the "even-numbered" sounds to be the
          // first training set.  In cross-validate mode, we'll swap
          // the training set for validation set in the second run.
          forTraining = nrSounds % 2 === 0;
          forValidation = !forTraining;
        }
        if (forTraining) {
          trainingData.push(featureVector);
          trainingLabels.push(featureVectorLabel);
        }
        if (forValidation) {
          validationData.push(featureVector);
          validationLabels.push(featureVectorLabel);
        }
        if (++nrSounds % 50 === 0) {
          log.info(`... extracted sound ${nrSounds}`);
        }
        if (!svmConfig.hasSustain) {
          // This sound class doesn't have "sustain", meaning it's
          // just an impulse.  We assume that the feature vector
          // length is sufficient to capture the impulse
          // characteristic --- if not, `hasSustain` should be true or
          // the feature vector should be adjusted! --- so we're done
          // with this clip.  We don't have a convenient way to stop
          // audio processing from here, so just hacky hack and throw
          // an exception.
          throw new DoneException();
        }
      });
      // Feed all the samples into the extractor.
      try {
        analyzer.appendSamples(samples, 0);
      } catch (e) {
        if (!(e instanceof DoneException)) {
          throw e;
        }
      }
      if (featureVectorCount === 0) {
        log.error(`Failed to extract loud sounds from clip ${testName}`);
        failedClips.push(testName);
        return Promise.resolve();
      }
      return Promise.resolve();
    };
    // Extract all the WAV test cases out of this (recursive) TAR
    // file.
    forEachFileInTAR(null, benchmarkTAR, runTestOrSuite)
      .then(() => {
        let extractionTimeMs = (Date.now() - extractionStart);
        log.info(`Extracted ${nrSounds} sounds in ${extractionTimeMs}ms`);
        log.info(`  failed to get loud sounds from ${failedClips.length} tracks: ${failedClips}`);
        log.info(`Preparing to start SVM training ...`);
        return trainSVM({ trainingData, trainingLabels,
                          validationData, validationLabels,
                          trainingConfig: svmTrainingConfig });
      })
      .then((result) => {
        log.info(`Finished with SVMs in ${result.totalSecs}s!`);
        if (Notification.permission === 'granted') {
          let notification = new Notification('Finished with SVMs',
                                              { body: result.report });
          log.info(`Created notification with title ${notification.title}`);
        }
        console.log(result.report);
        if (result.svmJSON) {
          log.info('Exporting JSON to new window ...');
          this._sendFileToUser(new Buffer(JSON.stringify(result.svmJSON)));
        }
      })
      .catch((err) => log.error('Problem training SVM:', err));
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
    // By *not* revoking the object URL, we allow it to be directly
    // saved (File -> Save As) in the results window that pops up.  We
    // don't make any attempt to track the lifetime of that window, so
    // we don't know of a good time to revoke that object URL.  So
    // don't even bother.
    //
    //URL.revokeObjectURL(url);
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
