/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

import React from 'react-native';
var {
  ScrollView,
  StyleSheet,
  View,
} = React;

var DeviceSetup = require('./DeviceSetup');
import { MonitorConnecting, MonitorPreview } from './MonitorPreview';
import mklog from 'log'; const log = mklog('MonitorPreview');

import { PlaceholderText } from './Text';

const PERIPH_EVENTS = [
  'discover',
  'connect',
  'rssi',
  'stateChange',
  'disconnect',
  'errorChange',
  'statusChange',
];

class MonitorsView extends React.Component {

  state = {
    configuring: {},
    streaming: {},
  };

  componentWillMount() {
    PERIPH_EVENTS.forEach(ev => this.props.bleDeviceManager.on(ev, this.refreshDeviceList));
    this.subscribeToSocket();
  }

  componentWillUnmount() {
    PERIPH_EVENTS.forEach(ev => this.props.bleDeviceManager.removeListener(ev, this.refreshDeviceList));
  }

  componentWillReceiveProps(nextProps) {
    if (this.props.socket !== nextProps.socket) {
      // Reset our UI state before we get the new socket so that we
      // don't have any children rendered that are still listening to
      // the old socket. Eventually, we should make those children
      // smart and detect themselves when the socket changes under
      // them and unsubscribe + resubscribe.
      this.setState({
        configuring: {},
        streaming: {},
      });
    }
  }

  componentDidUpdate(prevProps, prevState) {
    if (prevProps.socket !== this.props.socket) {
      if (prevProps.socket) {
        // In case we were still waiting for the old socket to
        // connect, unsubscribe ourselves from it.
        prevProps.socket.off('connect', this.subscribeToSocket);
        // Also be diligent about cleaning up after our other subscriptions.
        prevProps.socket.off('video-stream-new', this.onVideoStreamNew);
        prevProps.socket.off('video-stream-delete', this.onVideoStreamDelete);
      }
      this.subscribeToSocket();
    }
  }

  render() {
    var configuring = Object.keys(this.state.configuring).map(key => {
      var device = this.state.configuring[key];
      return <DeviceSetup key={key} name={device.name} rssi={device.rssi} />;
    });
    var streaming = Object.keys(this.state.streaming).map(key => {
      var device = this.state.streaming[key];
      if (device.placeholder) {
        return <MonitorConnecting key={key} status={device.status} />;
      }
      return (
        <MonitorPreview
          key={key}
          id={key}
          label={device.name}
          status={device.status}
          logo={device.logo}
          previewSize = {device.previewSize}
          {...this.props}
        />
      );
    });
    if (0 === configuring.length + streaming.length) {
      configuring = <PlaceholderMessage />;
    }
    return (
      <View style={styles.content}>
        <ScrollView
          style={styles.monitors}
          automaticallyAdjustContentInsets={true}>
          {configuring}
          {streaming}
        </ScrollView>
      </View>
    );
  }

  subscribeToSocket = () => {
    if (!this.props.socket) {
      return;
    }

    if (!this.props.socket.connected) {
      log.info('socket not connected yet.');
      this.props.socket.on('connect', this.subscribeToSocket);
      return;
    }

    log.info('socket connected, listening for video streams');
    this.props.socket.on('video-stream-new', this.onVideoStreamNew);
    this.props.socket.on('video-stream-delete', this.onVideoStreamDelete);
    this.props.socket.emit('join', 'video-streams');
  };

  onVideoStreamNew = (msg) => {
    log.info('new video stream', msg.id);

    // use device status from discovered peripheral if available
    let device = this.state.streaming[msg.id];
    let status = (device && device.status) ? device.status : '';

    this.state.streaming[msg.id] = {
      name: msg.name,
      logo: msg.logo,
      previewSize: msg.previewSize,
      status: status,
    };

    this.setState(this.state);
  };

  onVideoStreamDelete = (msg) => {
    log.info('deleted video stream', msg.id);
    delete this.state.streaming[msg.id];
    this.setState(this.state);
  };

  refreshDeviceList = () => {
    var configuring = this.state.configuring = {};
    var streaming = this.state.streaming;
    this.props.bleDeviceManager.enumerateDevices().forEach(p => {
      if ('unregistered' === p.state || 'registering' === p.state) {
        // Show configuring widget when we are registering
        configuring[p.id] = {
          name: p.prettyName,
          rssi: p.rssi,
          state: p.state,
          error: p.error,
        };
        return;
      }
      if ('registered' === p.state) {
        // Device is registered...
        if (!(p.deviceId in streaming)) {
          // Device has sent us its ID, but we haven't observed a
          // server-sent event from the device yet. Create a
          // starting-up placeholder widget for it that will be swapped
          // out once we get the device info from the server. Will need
          // remove if server-sent event never received.
          streaming[p.deviceId] = {
            name: 'New Device',
            placeholder: true,
          };
        }

        // update status, use error message if exists
        streaming[p.deviceId].status =
            p.error ? p.error : p.serverConnectionStatus;
      }
    });

    Object.keys(streaming).forEach(id => {
      if (!this.props.bleDeviceManager.enumerateDevices().some(
          p => p.deviceId === id && p.state !== 'disconnected')) {
        // Streaming widget still exists, but we are no longer connected
        // to the peripheral. Let's do some cleanup...

        // No longer receiving status update (over BLE), so clear status to not
        // show potentially stale data
        streaming[id].status = '';

        // We have not received a server-sent event. Delete placeholder widget,
        // less, it will linger indefinitely. If/when the server sends the
        // event, it will get added back in.
        if (streaming[id].placeholder) {
          delete streaming[id];
        }
      }
    });
    this.setState(this.state);
  };

}

var PlaceholderMessage = React.createClass({
  render: function() {
    return (
      <View style={styles.placeholderContainer}>
        <PlaceholderText>
          Connect Silk Cam to get started
        </PlaceholderText>
      </View>
    );
  },
});

const styles = StyleSheet.create({
  content: {
    borderColor: '#c8c7cc',
    borderTopWidth: 0.5,
    backgroundColor: 'white',
    flex: 1,
  },

  monitors: {
    paddingTop: 5,
    backgroundColor: '#efefef',
    flex: 1,
  },
});

module.exports = MonitorsView;
