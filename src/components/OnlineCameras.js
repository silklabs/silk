/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

import React from 'react';
import Diag from './Diag';
import CameraPreview from './CameraPreview';
import CameraVideo from './CameraVideo';
import { Button } from 'react-bootstrap';

import io from 'socket.io-client';
import mklog from '../log'; const log = mklog('OnlineCameras');
import { EventEmitter } from 'events';

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
    this._previewImageStream(false);
    this._videoClipStream(false);

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

  on(event, listener) {
    let ret = super.on(event, listener);
    this._adjustRooms(event);
    return ret;
  }

  removeListener(event, listener) {
    let ret = super.removeListener(event, listener);
    this._adjustRooms(event);
    return ret;
  }

  _adjustRooms(event) {
    let count = super.listeners(event).length;
    let enabled = count > 0;

    switch (event) {
    case 'previewImage':
      this._previewImageStream(enabled);
      break;
    case 'videoClip':
      this._videoClipStream(enabled);
      break;
    default:
      log.verbose(`Unhandled event: ${event}`);
    }
  }

  _previewImageStream(enabled) {
    let previewStream = 'video-preview-' + this.id;

    if (this.previewImage) {
      URL.revokeObjectURL(this.previewImage.src);
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

    log.debug('preview', msg);
    this.previewTimestamp = new Date(msg.when);
    this.previewObjects = msg.objects;

    let view = new Uint8Array(msg.frame);
    let blob = new Blob([view], { type: 'image/jpg' });
    if (this.previewImage) {
      URL.revokeObjectURL(this.previewImage.src);
    }
    this.previewImage.onload = () => this.emit('previewImage');
    this.previewImage.src = URL.createObjectURL(blob);
  }

  _videoClipStream(enabled) {
    let videoStream = 'video-' + this.id;

    if (this.videoClip) {
      URL.revokeObjectURL(this.videoClip);
      this.videoClip = null;
    }

    if (enabled) {
      log.info('Joining video stream ' + videoStream);
      this._socket.on(videoStream, this._onVideoStream);
      this._socket.emit('join', videoStream);

    } else {
      log.info('Leaving video stream ' + videoStream);
      this._socket.removeListener(videoStream, this._onVideoStream);
      this._socket.emit('leave', videoStream);
    }
  }

  _onVideoStream = msg => {
    if (!msg) {
      log.warning('_onVideoStream: null msg');
      return;
    }
    if (!msg.frame) {
      log.warning('_onVideoStream: null msg.frame');
      return;
    }
    if (this.id !== msg.id) {
      log.warning('Video preview from unknown camera:', msg);
      return;
    }

    log.debug('video', msg);

    let view = new Uint8Array(msg.frame);
    let blob = new Blob([view], { type: 'video/mp4' });
    if (this.videoClip) {
      URL.revokeObjectURL(this.videoClip);
    }
    this.videoClip = URL.createObjectURL(blob);
    this.emit('videoClip', this.videoClip);
  }

}


export default class OnlineCameras extends React.Component {

  static propTypes = {
    serverUrl: React.PropTypes.string,
  }

  constructor(props) {
    super(props);
    this.state = {
      connectionStatus: `Connecting... ${props.serverUrl}`,
      cameras: {},
      diagVisible: false,
    };

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

  onCloseDiag = () => {
    this.setState({diagVisible: false});
  }

  onOpenDiag = () => {
    this.setState({diagVisible: true});
  }

  onCameraClick = (id) => {
    this.setState({videoId: id});
  }
  onVideoClick = () => {
    this.setState({videoId: null});
  }

  render() {
    if (this.state.diagVisible) {
      return <Diag onClose={this.onCloseDiag} {...this.state}/>;
    }
    if (this.state.videoId) {
      let id = this.state.videoId;
      let camera = this.state.cameras[id];
      if (camera) {
        return <CameraVideo key={id} onClick={this.onVideoClick} camera={camera} />;
      }
    }
    return (
      <div>
        <div>
          {
            Object.keys(this.state.cameras).map(id=> {
              return <CameraPreview key={id} onClick={this.onCameraClick} camera={this.state.cameras[id]} />;
            })
          }
        </div>
        <Button onClick={this.onOpenDiag}>Diag</Button>
      </div>
    );
  }
}
