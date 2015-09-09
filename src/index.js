/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

import React from 'react';
import Diag from './components/diag';
import io from 'socket.io-client';
import mklog from './log'; const log = mklog('index');

if (typeof config !== 'object') {
  var config = {}; // config.local.js doesn't exist
}

class ServerConnection extends React.Component {

  static propTypes = {
    serverUrl: React.PropTypes.string,
  }

  constructor(props) {
    super(props);
    this.state = {connectionStatus: 'Initializing...', cameras: {}};

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
        if (this.state.cameras[msg.id]) {
          let logs = this.state.cameras[msg.id].logs;
          switch (msg.type) {
          case 'dash':
            logs.dash = msg.log;
            break;
          case 'procrank':
            logs.procrank = msg.log;
            break;
          case 'logcat':
            const maxLines = 500;

            if (!logs.logcat) {
              logs.logcat = [];
            }
            let newlog = msg.log;
            newlog.split(/\r?\n/).map(line => {
              if (line.length > 0) {
                logs.logcat.push(line);
              }
            });
            while (logs.logcat.length > maxLines) {
              logs.logcat.shift();
            }
            break;
          default:
            log.error('Unknown log type', msg.type);
            break;
          }
          this.setState({
            connectionStatus: this.state.connectionStatus,
          });
        }
      });
      this.socket.on('disconnect', e => {
        this.setState({
          connectionStatus: `Disconnected from server: ${e}. Reload?`,
          cameras: {}
        });
      });

      this.socket.on('video-stream-new', msg => {
        log.info('New camera', msg.name, msg.id);
        this.state.cameras[msg.id] = { name: msg.name, logs: {} };
        this.setState({
          connectionStatus: `${Object.keys(this.state.cameras).length} cameras connected`,
          cameras: this.state.cameras,
        });
      });

      this.socket.on('video-stream-delete', msg => {
        log.info('Lost camera', msg.name, msg.id);
        if (this.state.cameras[msg.id]) {
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

    this.onSetLogging = (id, enabled) => {
      if (!this.socket) {
        throw new Error('null socket');
      }
      if (!id) {
        return;
      }
      let config = {};
      if (enabled) {
        config.dash = 1;
        config.logcat = 1;
        config.procrank = 1;
      }

      this.socket.emit('cmd', {
        id: id,
        msg: 'diag',
        config: config
      });
    };

  }

  render() {
    return <Diag onSetLogging={this.onSetLogging} {...this.state}/>;
  }
}


// TODO: Remove "legacy" webapp as soon as possible
if (document.title === 'Silk Diag') {
  React.render(<ServerConnection />, document.body);
} else if (document.title === 'Silk Server') {
  require('./legacy/silk');
}
