/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

import React from 'react';
import mklog from '../log'; const log = mklog('diag');
import ansiUp from 'ansi_up';
import CameraPreview from './CameraPreview';

class Diag extends React.Component {
  static propTypes = {
    connectionStatus: React.PropTypes.string.isRequired,
    cameras: React.PropTypes.object.isRequired,
  }

  constructor(props) {
    super(props);
    this.state = {};
  }

  onCameraSelect = id => {
    log.info(`Selected camera: ${id}`);

    let prevCamera = this.props.cameras[this.state.cameraId];
    let nextCamera = this.props.cameras[id];

    if (prevCamera) {
      prevCamera.logging = false;
      prevCamera.preview = false;
    }
    if (nextCamera) {
      nextCamera.logging = true;
      nextCamera.preview = true;
    }
    this.setState({cameraId: id});
    this.reconnectCameraId = null;
  }

  onPause = paused => {
    log.info(`paused=${paused}`);
    this.setState({paused});
  }

  componentWillReceiveProps(nextProps) {
    if (this.state.cameraId) {
      if (!nextProps.cameras[this.state.cameraId]) {
        this.reconnectCameraId = this.state.cameraId;
        this.setState({cameraId: null});
      }
    } else {
      if (nextProps.cameras[this.reconnectCameraId]) {
        log.info(`Reconnecting to ${this.reconnectCameraId}`);
        this.onCameraSelect(this.reconnectCameraId);
      }
    }
  }

  render() {
    let style = {
      margin: 0,
      padding: 0,
      width: '100%',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: 'lightgrey'
    };
    if (this.state.cameraId) {
      style.backgroundColor = this.state.paused ? 'papayawhip' : 'white';
    }

    let camera = null;
    let logs = {};
    if (this.state.cameraId) {
      camera = this.props.cameras[this.state.cameraId];
      logs = camera.logs;
    }

    return (
      <div style={style}>
        <DiagNavBar onCameraSelect={this.onCameraSelect}
                    cameras={this.props.cameras}
                    cameraId={this.state.cameraId}
                    onPause={this.onPause}
                    connectionStatus={this.props.connectionStatus} />
        <div style={{flex: 1, display: 'flex', flexDirection: 'row'}}>
          <DiagLog logName='dash' log={logs.dash} paused={this.state.paused}/>
          <CameraPreview camera={camera}/>
        </div>
        <DiagLog logName='procrank' log={logs.procrank} paused={this.state.paused}/>
        <DiagLogcat logName='logcat' log={logs.logcat} paused={this.state.paused}/>
      </div>
    );
  }
}


class DiagLog extends React.Component {
  static propTypes = {
    logName: React.PropTypes.string.isRequired,
    log: React.PropTypes.string,
    paused: React.PropTypes.bool,
  }

  constructor(props) {
    super(props);
    this.state = {};
    this.style = {
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
  }

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
    this.style.flex = 2;
  }

  render() {
    if (!this.props.log) {
      return super.render();
    }

    let log = this.props.log;
    return (
      <div style={this.style}>
        {
          log.map(line => {
            let html = ansiUp.ansi_to_html(line);
            // NOTE: ansi_to_html() will also escape HTML characters (&, <) so
            // using "dangerouslySetInnerHTML" should be safe
            return <div dangerouslySetInnerHTML={{__html: html}} />;
          })
        }
      </div>
    );
  }

  componentDidUpdate() {
    let dom = React.findDOMNode(this);
    dom.scrollTop = dom.scrollHeight;
  }
}


class DiagNavBar extends React.Component {
  static propTypes = {
    connectionStatus: React.PropTypes.string.isRequired,
    cameras: React.PropTypes.object, // same shape as what Diag expects
    cameraId: React.PropTypes.string,
    onCameraSelect: React.PropTypes.func.isRequired,
    onPause: React.PropTypes.func.isRequired,
  }

  constructor(props) {
    super(props);
  }

  onCameraSelect = id => {
    this.props.onCameraSelect(id);
  }

  render() {
    let style = {
      margin: 2,
      padding: 5,
      backgroundColor: 'lightblue',
    };

    return <div style={style}>
      <DiagNavCameraSelect onCameraSelect={this.onCameraSelect}
                           cameras={this.props.cameras}/>
      &nbsp;
      <DiagNavPause onPause={this.props.onPause} cameraId={this.props.cameraId} />
      &nbsp; | &nbsp;
      <i>{this.props.connectionStatus}</i>
    </div>;
  }
}


class DiagNavPause extends React.Component {
  static propTypes = {
    onPause: React.PropTypes.func.isRequired,
    cameraId: React.PropTypes.string,
  }

  constructor(props) {
    super(props);
    this.state = {};
  }

  handleClick = () => {
    let paused = !this.state.paused;
    this.setState({paused});
    this.props.onPause(paused);
  }

  render() {
    let style = {
      cursor: 'pointer',
      backgroundColor: this.state.paused ? 'lightgreen' : 'orange',
      padding: 4,
      display: this.props.cameraId ? 'inline' : 'none'
    };

    return <span style={style} onClick={this.handleClick}>{this.state.paused ? 'Unpause' : 'Pause'}</span>;
  }
}


class DiagNavCameraSelect extends React.Component {
  static propTypes = {
    onCameraSelect: React.PropTypes.func.isRequired,
    cameras: React.PropTypes.object, // same shape as what Diag expects
  }

  constructor(props) {
    super(props);
    this.state = {value: null};
  }

  handleChange = e => {
    let newValue = e.target.value;
    this.setState({value: newValue});
    this.props.onCameraSelect(newValue);
  }

  render() {
    let style = {
      cursor: 'pointer',
      padding: 4,
    };

    let cameras = this.props.cameras || {};
    return <span>Camera: &nbsp;
      <select style={style} onChange={this.handleChange} value={this.state.value}>
        <option value=''>(None)</option>
        {
          Object.keys(cameras).map(id=> {
            return <option key={id} value={id}>{cameras[id].name}</option>;
          })
        }
      </select>
    </span>;
  }
}

export default Diag;
