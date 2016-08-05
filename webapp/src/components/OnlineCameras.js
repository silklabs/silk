
import React from 'react';
import { Alert, Button, Glyphicon, DropdownButton, MenuItem } from 'react-bootstrap';
import { Link } from 'react-router';
import createLog from 'silk-log';
import { signalDevice } from 'silk-rtc';

import Api from '../libraries/Api';
import Cameras from '../libraries/Cameras';
import CameraPreview from './CameraPreview';

import version from 'silk-core-version';

const log = createLog('OnlineCameras');

const styles = {
  center: {
    marginLeft: 'auto',
    marginRight: 'auto',
  },
  flexRow: {
    display: 'flex',
    flexWrap: 'wrap',
  },
  glyphicon: {
    fontSize: '20px',
  },
  onlineCamera: {
    padding: '10px',
  },
  toolbar: {
    border: '1px solid gray',
    borderRadius: '5px',
    display: 'flex',
  },
  toolbarCenter: {
    'justifyContent': 'center',
  },
  speechText: {
    flex: 1,
  },
};

let micStreamPromise = null;
let micStream = null;

function tryGetMicStream() {
  if (micStream) {
    return Promise.resolve(micStream);
  }
  if (micStreamPromise) {
    return micStreamPromise;
  }
  if (!navigator.mediaDevices.getUserMedia) {
    //eslint-disable-next-line no-alert
    alert('null getUserMedia(). Chrome?  Use --unsafely-treat-insecure-origin-as-secure');
    return Promise.reject();
  }
  micStreamPromise = navigator.mediaDevices.getUserMedia({ audio: true })
    .then((stream) => {
      micStream = stream;
      micStreamPromise = null;
      return micStream;
    })
    .catch((err) => log.error(`Failed to get mic stream: ${err.stack}`));
  return micStreamPromise;
}

export class OnlineCamera extends React.Component {
  intercomPeer = null;
  state = {
    intercomOn: false,
  };

  constructor() {
    super();
    this.speakText = '';
  }

  get deviceId() {
    return this.props.params.deviceId;
  }

  handleTextChange = e => {
    this.speakText = e.target.value;
  };

  onSpeak = (eventKey) => {
    this.props.camera.speak(eventKey, this.speakText);
  };

  onToggleIntercom = (e) => {
    let intercomOn = !this.state.intercomOn;
    this.setState({ intercomOn });
    if (intercomOn) {
      log.info('Turning on webapp->device audio stream');
      tryGetMicStream()
        .then((micStream) => {
          log.info('Got mic stream, connecting RTC channel and praying ...');
          this.intercomPeer = signalDevice(Api, this.deviceId, {
            mediaStreams: {
              local: micStream,
            },
          });
          // TODO: error handling here?
        })
        .catch((err) => log.error(`Failed to get mic stream: ${err}`));
    } else {
      log.info('Turning off webapp->device audio stream');
      this.reset();
    }
  };

  reset() {
    if (this.intercomPeer) {
      this.intercomPeer.disconnect();
      this.intercomPeer = null;
    }
  }

  componentWillUnmount() {
    this.reset();
    this.setState({ intercomOn: false });
  }

  render() {
    let intercomStyle = this.state.intercomOn ? 'warning' : '';
    return (
      <div style={styles.onlineCamera}>
        <Link to={`/video/${this.deviceId}`}>
          <CameraPreview deviceId={this.deviceId} />
        </Link>
        <div style={{...styles.toolbar, ...styles.toolbarCenter}}>
          <Button
            bsSize="small"
            bsStyle={intercomStyle}
            active={this.state.intercomOn}
            onClick={this.onToggleIntercom}>
            <Glyphicon glyph="bullhorn" style={styles.glyphicon} />
          </Button>
          <Link to={`/diag/${this.deviceId}`}>
            <Button bsSize="small" bsStyle="info">
              <Glyphicon glyph="info-sign" style={styles.glyphicon} />
            </Button>
          </Link>
          <Link to={`/avpipeline/${this.deviceId}`}>
            <Button bsSize="small">
              <Glyphicon glyph="indent-left" style={styles.glyphicon} />
            </Button>
          </Link>
          <Link to={`/chunks/${this.deviceId}`}>
            <Button bsSize="small">
              <Glyphicon glyph="list" style={styles.glyphicon} />
            </Button>
          </Link>
          <Link to={`/audiostudio/${this.deviceId}`}>
            <Button bsSize="small">
              <Glyphicon glyph="headphones" style={styles.glyphicon} />
            </Button>
          </Link>
          <Link to={`/webrtc/${this.deviceId}`}>
            <Button bsSize="small">
              <Glyphicon glyph="facetime-video" style={styles.glyphicon} />
            </Button>
          </Link>
          <Link to={`/datachannel/${this.deviceId}`}>
            <Button bsSize="small">
              <Glyphicon glyph="transfer" style={styles.glyphicon} />
            </Button>
          </Link>
        </div>
        <div style={styles.toolbar}>
          <DropdownButton bsSize="small" title="Speak with" id="speak"
            disabled={!this.props.online} onSelect={this.onSpeak}>
            <MenuItem eventKey="ttscereproc">ttscereproc</MenuItem>
            <MenuItem eventKey="ttspico">ttspico</MenuItem>
          </DropdownButton>
          <input type="text" placeholder="Enter the text to speak" style={styles.speechText}
            onChange={this.handleTextChange}>
          </input>
        </div>
    </div>
    );
  }
}

export class OnlineCameras extends React.Component {
  state = {
    cameras: {},
    status: '',
    webrtc: localStorage.webrtc === 'true',
  };

  componentWillMount() {
    Cameras.on('stateChanged', this.onCamerasStateChanged);
    this.onCamerasStateChanged(Cameras);
  }

  componentWillUnmount() {
    Cameras.removeListener('stateChanged', this.onCamerasStateChanged);
  }

  onCamerasStateChanged = state => {
    this.setState({ cameras: state.cameras, status: state.status });
  };

  _onToggleWebrtc = () => {
    // XXX: Sorry! Temp code...
    let state = !this.state.webrtc;
    localStorage.webrtc = state;
    console.log('set state', state);
    this.setState({ webrtc: state });
    Cameras.setWebRTC(state);
  };

  render() {
    let cameras = Object.keys(this.state.cameras).map(id => (
      <OnlineCamera
        key={id}
        params={{deviceId: id}}
        camera={this.state.cameras[id]}
        online={this.state.cameras[id].online}
      />
    ));
    return (
      <div>
        <Alert bsStyle="info">
          {this.state.status}<br/>
          <small>Server: {Api.config.serverUrl}</small>
          <div>
            <Button onClick={this._onToggleWebrtc}>
              {this.state.webrtc ? 'Disable' : 'Enable'} WebRTC
            </Button>
          </div>
        </Alert>
        <div style={styles.flexRow}>{cameras}</div>
        <Link style={{float: 'right'}} to="/login">
          <Button bsStyle="warning">
            <Glyphicon glyph="log-out" style={styles.glyphicon} />
          </Button>
        </Link>
        <div style={{textAlign: 'center'}}>
          <small>
            {version.branch} {version.semver} (
              <a href={'https://github.com/silklabs/silk-core/commit/' + version.sha}>
                {version.sha.substr(0, 7)}
              </a>
            )
          </small>
        </div>
      </div>
    );
  }
}
