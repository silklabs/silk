/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

import React from 'react';
import { Button, Glyphicon } from 'react-bootstrap';
import { Link } from 'react-router';

import Cameras from '../libraries/Cameras';
import CameraPreview from './CameraPreview';

const styles = {
  center: {
    marginLeft: 'auto',
    marginRight: 'auto'
  },
  flexRow: {
    display: 'flex',
    flexDirection: 'row'
  },
  glyphicon: {
    fontSize: '25px'
  },
  onlineCamera: {
    padding: '10px 0 10px 10px',
  },
  toolbar: {
    border: '1px solid gray',
    borderRadius: '5px',
  },
};

export class OnlineCamera extends React.Component {
  deviceId() {
    return this.props.params.deviceId;
  }

  render() {
    return (
      <div style={styles.onlineCamera}>
        <Link to={`/video/${this.deviceId()}`}>
          <CameraPreview deviceId={this.deviceId()} />
        </Link>
        <div style={styles.toolbar}>
          <div style={styles.flexRow}>
            <div style={styles.center}>
              <Link to={`/diag/${this.deviceId()}`}>
                <Button bsSize="large" bsStyle="info">
                  <Glyphicon glyph="info-sign" style={styles.glyphicon} />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }
}

export class OnlineCameras extends React.Component {
  state = { cameras: {}, status: '' };

  componentWillMount() {
    Cameras.on('stateChanged', this.onCamerasStateChanged);
    this.onCamerasStateChanged(Cameras);
  }

  componentWillUnmount() {
    Cameras.removeListener('stateChanged', this.onCamerasStateChanged);
  }

  onCamerasStateChanged = state => {
    this.setState({ cameras: state.cameras, status: state.status });
  }

  render() {
    let cameras = Object.keys(this.state.cameras).map(
      id => <OnlineCamera key={id}
                          params={{deviceId: id}} />);
    return (<div style={styles.flexRow}>{cameras}</div>);
  }
}
