
import React from 'react';
import { Alert, Button, Glyphicon, DropdownButton, MenuItem } from 'react-bootstrap';
import { Link } from 'react-router';

import Api from '../libraries/Api';
import Cameras from '../libraries/Cameras';
import CameraPreview from './CameraPreview';

import version from 'silk-core-version';

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

export class OnlineCamera extends React.Component {
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

  onSpeak = (e, ttsEngine) => {
    this.props.camera.speak(ttsEngine, this.speakText);
  };

  render() {
    return (
      <div style={styles.onlineCamera}>
        <Link to={`/video/${this.deviceId}`}>
          <CameraPreview deviceId={this.deviceId} />
        </Link>
        <div style={{...styles.toolbar, ...styles.toolbarCenter}}>
          <Link to={`/diag/${this.deviceId}`}>
            <Button bsSize="large" bsStyle="info">
              <Glyphicon glyph="info-sign" style={styles.glyphicon} />
            </Button>
          </Link>
          <Link to={`/avpipeline/${this.deviceId}`}>
            <Button bsSize="large">
              <Glyphicon glyph="indent-left" style={styles.glyphicon} />
            </Button>
          </Link>
          <Link to={`/chunks/${this.deviceId}`}>
            <Button bsSize="large">
              <Glyphicon glyph="list" style={styles.glyphicon} />
            </Button>
          </Link>
          <Link to={`/audiostudio/${this.deviceId}`}>
            <Button bsSize="large">
              <Glyphicon glyph="headphones" style={styles.glyphicon} />
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
