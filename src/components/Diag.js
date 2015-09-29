/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

import ansiUp from 'ansi_up';
import React from 'react';
import { Button, ButtonGroup, Glyphicon, Input } from 'react-bootstrap';
import { Link } from 'react-router';

import Cameras from '../libraries/Cameras';
import CameraPreview from './CameraPreview';
import mklog from '../log'; const log = mklog('diag');

export default class Diag extends React.Component {
  state = { camera: null, paused: false };

  get deviceId() {
    return this.props.params.deviceId;
  }

  componentWillMount() {
    Cameras.on('stateChanged', this.onCamerasStateChanged);
    this.onCamerasStateChanged(Cameras);
  }

  componentWillUnmount() {
    Cameras.removeListener('stateChanged', this.onCamerasStateChanged);
    let camera = this.state.camera;
    if (camera) {
      camera.logging = false;
      camera.removeListener('diag', this.onDiag);
    }
  }

  onCamerasStateChanged = state => {
    let oldCamera = this.state.camera;
    let newCamera = state.cameras[this.deviceId];

    if (oldCamera === newCamera) {
      return;
    }
    if (oldCamera) {
      oldCamera.logging = false;
      oldCamera.removeListener('diag', this.onDiag);
    }
    if (newCamera) {
      newCamera.logging = true;
      newCamera.on('diag', this.onDiag);
    }
    this.setState({ camera: newCamera });
  };

  onDiag = () => {
    this.forceUpdate(); // TODO: log data is updated as a state side-effect. Naughty
  };

  onPause = () => {
    let paused = !this.state.paused;
    log.info(`paused=${paused}`);
    this.setState({paused});
  };

  render() {
    let style = {
      margin: 0,
      padding: 0,
      width: '100%',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: this.state.paused ? 'papayawhip' : 'white'
    };

    let { camera, paused } = this.state;
    if (!camera) {
      return (<div>Waiting for camera {this.deviceId} to connect ...</div>);
    }

    let logs = camera.logs;
    return (
      <div style={style}>
        <ButtonGroup>
          <Button bsStyle='warning'>
            <Link to="/"><Glyphicon glyph="home" /></Link>
          </Button>
          <Button onClick={this.onPause}>
            <Glyphicon glyph={ paused ? 'play' : 'pause' } />
          </Button>
        </ButtonGroup>
        <div style={{flex: 1, display: 'flex', flexDirection: 'row'}}>
          <DiagLog logName='dash' log={logs.dash} paused={paused}/>
          <CameraPreview deviceId={this.deviceId}/>
        </div>
        <DiagLog logName='procrank' log={logs.procrank} paused={paused}/>
        <DiagLogcat logName='logcat' log={logs.logcat} paused={paused}/>
      </div>
    );
  }
}


class DiagLog extends React.Component {
  static propTypes = {
    logName: React.PropTypes.string.isRequired,
    log: React.PropTypes.string,
    paused: React.PropTypes.bool,
  };

  style = {
    flex: 1,
    fontFamily: 'monospace',
    overflowY: 'scroll',
    overflowX: 'hidden',
    margin: 2,
    padding: 5,
    borderStyle: 'solid',
    borderColor: '#D3D3D3',
    borderWidth: 2
  };

  shouldComponentUpdate() {
    return !this.props.paused;
  }

  render() {
    return <pre style={this.style}>{this.props.log || this.props.logName}</pre>;
  }
}


class DiagLogcat extends DiagLog {
  static propTypes = {
    logName: React.PropTypes.string.isRequired,
    log: React.PropTypes.array,
    paused: React.PropTypes.bool,
  }

  constructor(props) {
    super(props);
    this.state = { filter: '' };
    this.style.flex = 2;
  }

  onFilterChange = e => {
    this.setState({ filter: e.target.value });
  };

  render() {
    if (!this.props.log) {
      return super.render();
    }

    let log = this.props.log;
    // The empty pattern is found in any text.  'i' means case
    // insensitive.
    let filterRx;
    try {
      filterRx = new RegExp(this.state.filter, 'i');
    } catch(e) {
      filterRx = /INVALID/;
    }
    return (
      <div style={this.style}>
        {
          log.filter(line => 0 <= line.search(filterRx))
             .map(line => {
               let html = ansiUp.ansi_to_html(line);
               // NOTE: ansi_to_html() will also escape HTML
               // characters (&, <) so using "dangerouslySetInnerHTML"
               // should be safe
               return <div dangerouslySetInnerHTML={{__html: html}} />;
             })
        }
        <Input ref='filter' type='text' placeholder='Filter regexp'
               onChange={this.onFilterChange} />
      </div>
    );
  }

  componentDidUpdate() {
    let dom = React.findDOMNode(this);
    dom.scrollTop = dom.scrollHeight;
  }
}
