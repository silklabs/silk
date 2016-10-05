
import React from 'react';
import { Alert, Button, Glyphicon } from 'react-bootstrap';
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

  onClickRemoveDevice = e => {
    //eslint-disable-next-line no-alert
    const doit = confirm(`Do you really want to remove device ${this.deviceId}?`);
    if (doit) {
      Cameras.unregister(this.deviceId);
    }
  }

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
            bsSize="xsmall"
            bsStyle={intercomStyle}
            active={this.state.intercomOn}
            onClick={this.onToggleIntercom}>
            <Glyphicon glyph="bullhorn" style={styles.glyphicon} />
          </Button>
          <Link to={`/diag/${this.deviceId}`}>
            <Button bsSize="xsmall" bsStyle="info">
              <Glyphicon glyph="info-sign" style={styles.glyphicon} />
            </Button>
          </Link>
          <Link to={`/avpipeline/${this.deviceId}`}>
            <Button bsSize="xsmall">
              <Glyphicon glyph="indent-left" style={styles.glyphicon} />
            </Button>
          </Link>
          <Link to={`/chunks/${this.deviceId}`}>
            <Button bsSize="xsmall">
              <Glyphicon glyph="list" style={styles.glyphicon} />
            </Button>
          </Link>
          <Link to={`/eventviewer/${this.deviceId}`}>
            <Button bsSize="xsmall">
              <Glyphicon glyph="screenshot" style={styles.glyphicon} />
            </Button>
          </Link>
          <Link to={`/audiostudio/${this.deviceId}`}>
            <Button bsSize="xsmall">
              <Glyphicon glyph="headphones" style={styles.glyphicon} />
            </Button>
          </Link>
          <Link to={`/webrtc/${this.deviceId}`}>
            <Button bsSize="xsmall">
              <Glyphicon glyph="facetime-video" style={styles.glyphicon} />
            </Button>
          </Link>
          <Link to={`/datachannel/${this.deviceId}`}>
            <Button bsSize="xsmall">
              <Glyphicon glyph="transfer" style={styles.glyphicon} />
            </Button>
          </Link>
          <Button bsSize="xsmall" onClick={this.onClickRemoveDevice}>
            <Glyphicon glyph="remove-circle" style={styles.glyphicon} />
          </Button>
        </div>
    </div>
    );
  }
}

export class OnlineCameras extends React.Component {
  state = {
    cameras: {},
    status: '',
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
