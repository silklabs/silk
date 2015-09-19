/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

import React from 'react';
import { Button, Glyphicon } from 'react-bootstrap';
import { Link } from 'react-router';

import Cameras from '../libraries/Cameras';
import CameraPreview from './CameraPreview';
import CameraVideo from './CameraVideo';
import mklog from '../log'; const log = mklog('OnlineCameras');

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

class OnlineCamera extends React.Component {
  static propTypes = {
    camera: React.PropTypes.object,
    onClick: React.PropTypes.func
  };

  render() {
    return (
      <div style={styles.onlineCamera}>
        <CameraPreview camera={this.props.camera}
          onClick={this.props.onClick} />
        <div style={styles.toolbar}>
          <div style={styles.flexRow}>
            <div style={styles.center}>
              <Link to={`/diag/${this.props.camera.id}`}>
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

export default class OnlineCameras extends React.Component {
  state = { cameras: {}, status: '' };

  constructor(props) {
    super(props);
  }

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
  
  onCameraClick = (id) => {
    this.setState({videoId: id});
  }
  onVideoClick = () => {
    this.setState({videoId: null});
  }

  render() {
    if (this.state.videoId) {
      let id = this.state.videoId;
      let camera = this.state.cameras[id];
      if (camera) {
        return <CameraVideo key={id} onClick={this.onVideoClick} camera={camera} />;
      }
    }
    let cameras = Object.keys(this.state.cameras).map(
      id => <OnlineCamera key={id}
                          camera={this.state.cameras[id]}
                          onClick={this.onCameraClick} />);
    return (<div style={styles.flexRow}>{cameras}</div>);
  }
}
