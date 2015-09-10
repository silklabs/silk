/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

import React from 'react';
import Diag from './components/diag';
import io from 'socket.io-client';
import mklog from './log'; const log = mklog('index');
import { EventEmitter } from 'events';

let config = {};
try {
  config = require('../config.local.json');
} catch (e) {
  if (e.code !== 'MODULE_NOT_FOUND') {
    throw e;
  }
}

class Camera extends EventEmitter {
  constructor(name, id, logo, previewSize, socket) {
    super();
    this.name = name;
    this.id = id;
    this.previewSize = previewSize;
    this.logs = {};
    this._socket = socket;

    this.logoImage = document.createElement('img');
    let logoArray = new Uint8Array(logo);
    if (logoArray.length > 0) {
      let blob = new Blob([logoArray], { type: 'image/png' });
      this.logoImage.src = URL.createObjectURL(blob);
    }
  }

  deinit() {
    this.logging = false;
    this.preview = false;
    this.video = false;
    URL.revokeObjectURL(this.logoImage.src);
  }

  feedNewLog(type, data) {
    switch (type) {
    case 'dash':
    case 'procrank':
      this.logs[type] = data;
      break;
    case 'logcat':
      const maxLines = 500;

      let logcat = this.logs.logcat || [];
      data.split(/\r?\n/).map(line => {
        if (line.length > 0) {
          logcat.push(line);
        }
      });
      while (logcat.length > maxLines) {
        logcat.shift();
      }
      this.logs.logcat = logcat;
      break;
    default:
      log.error('Unknown log type', type);
      break;
    }
  }

  set logging(enabled) {
    if (!enabled) {
      // FIX ME!
      log.warn(`
        TODO: The logging state is currently GLOBAL (stored on the device and
              common to all clients.  This is very broken, but for now this means
              that logging is never really disabled to avoid unduly disturbing
              others.
      `);
    }

    let flag = enabled ? 1 : 0;
    let config = {
      dash: flag,
      logcat: flag,
      procrank: flag,
    };

    this._socket.emit('cmd', {
      id: this.id,
      msg: 'diag',
      config
    });
  }

  set preview(enabled) {
    let previewStream = 'video-preview-' + this.id;

    if (this.previewImage) {
      URL.revokeObjectURL(this.previewImage.src);
      this.previewImage = null;
    }

    if (enabled) {
      log.info('Joining preview stream ' + previewStream);
      this.previewImage = document.createElement('img');
      this._socket.on(previewStream, this._onPreviewStream);
      this._socket.emit('join', previewStream);

    } else {
      log.info('Leaving preview stream ' + previewStream);
      this._socket.removeListener(previewStream, this._onPreviewStream);
      this._socket.emit('leave', previewStream);
    }
  }

  _onPreviewStream = msg => {
    if (!msg) {
      log.warning('_onPreviewStream: null msg');
      return;
    }
    if (!msg.frame) {
      log.warning('_onPreviewStream: null msg.frame');
      return;
    }
    if (this.id !== msg.id) {
      log.warning('Video preview from unknown camera:', msg);
      return;
    }

    log.debug('video preview', msg);
    this.previewTimestamp = new Date(msg.when);
    this.previewObjects = msg.objects;

    let view = new Uint8Array(msg.frame);
    let blob = new Blob([view], { type: 'image/jpg' });
    URL.revokeObjectURL(this.previewImage.src);
    this.previewImage.onload = () => this.emit('previewImage');
    this.previewImage.src = URL.createObjectURL(blob);
  }

  set video(enabled) {
    log.warn(`video: ${enabled}`);
  }
}


class ServerConnection extends React.Component {

  static propTypes = {
    serverUrl: React.PropTypes.string,
  }

  constructor(props) {
    super(props);
    this.state = {connectionStatus: `Connecting... ${props.serverUrl}`, cameras: {}};

    this.socket = null;
    this.api = require('silk-api-react-native')({serverUrl: props.serverUrl});
    this.api.socketio.address().then(result => {
      this.setState({
        connectionStatus: `Connecting to ${result.url}...`,
      });

      this.socket = io(result.url, {
        transports: ['websocket']
      });

      this.socket.on('connect', () => {
        this.setState({
          connectionStatus: `Connected to server`,
        });
        this.socket.emit('join', 'logging');
        this.socket.emit('join', 'video-streams');
      });

      this.socket.on('log', msg => {
        let camera = this.state.cameras[msg.id];
        if (camera) {
          camera.feedNewLog(msg.type, msg.log);
          this.forceUpdate(); // TODO: log data is updated as a state side-effect. Naughty
        }
      });

      this.socket.on('disconnect', e => {
        let cameras = this.state.cameras;
        Object.keys(cameras).forEach(id => cameras[id].deinit());

        this.setState({
          connectionStatus: `Disconnected from server: ${e}. Reload?`,
          cameras: {}
        });
        log.error('Server disconnected');
      });

      this.socket.on('video-stream-new', msg => {
        log.info('New camera', msg.name, msg.id);
        this.state.cameras[msg.id] = new Camera(msg.name, msg.id, msg.logo,
          msg.previewSize, this.socket);
        this.setState({
          connectionStatus: `${Object.keys(this.state.cameras).length} cameras connected`,
          cameras: this.state.cameras,
        });
      });

      this.socket.on('video-stream-delete', msg => {
        log.info('Lost camera', msg.name, msg.id);

        let camera = this.state.cameras[msg.id];
        if (camera) {
          camera.deinit();
          delete this.state.cameras[msg.id];

          this.setState({
            connectionStatus: `${Object.keys(this.state.cameras).length} cameras connected`,
            cameras: this.state.cameras,
          });
        }
      });

    }).catch(err => {
      this.setState({status: `Could not get socket.io address: ${err}`});
    });

  }

  render() {
    return <Diag {...this.state}/>;
  }
}


// TODO: Remove "legacy" webapp as soon as possible
if (document.title === 'Silk Diag') {
  React.render(<ServerConnection serverUrl={config.serverUrl}/>, document.body);
} else if (document.title === 'Silk Server') {
  require('./legacy/silk');
}
