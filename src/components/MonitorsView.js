/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

import React from 'react-native';
var {
  ScrollView,
  StyleSheet,
  View,
} = React;

import mklog from 'log'; const log = mklog('MonitorPreview');

import DeviceSetup from './DeviceSetup';
import { MonitorConnecting, MonitorPreview } from './MonitorPreview';
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
    var configuring = Object.keys(this.state.configuring).map(deviceId => {
      var device = this.state.configuring[deviceId];
      return <DeviceSetup key={deviceId} name={device.name} rssi={device.rssi} />;
    });
    var streaming = Object.keys(this.state.streaming).map(deviceId => {
      var device = this.state.streaming[deviceId];
      if (device.placeholder) {
        return <MonitorConnecting key={deviceId} status={device.status} />;
      }
      return (
        <MonitorPreview
          key={deviceId}
          deviceId={deviceId}
          label={device.name}
          status={device.status}
          logo={device.logo}
          previewSize={device.previewSize}
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
    this.props.bleDeviceManager.enumerateDevices().forEach(device => {
      if ('unregistered' === device.state || 'registering' === device.state) {
        // Show configuring widget when we are registering
        configuring[device.id] = {
          name: device.prettyName,
          rssi: device.rssi,
          state: device.state,
          error: device.error,
        };
        return;
      }
      if ('registered' === device.state) {
        // Device is registered...
        if (!(device.deviceId in streaming)) {
          // Device has sent us its ID, but we haven't observed a
          // server-sent event from the device yet. Create a
          // starting-up placeholder widget for it that will be swapped
          // out once we get the device info from the server. Will need
          // remove if server-sent event never received.
          streaming[device.deviceId] = {
            name: 'New Device',
            placeholder: true,
          };
        }

        // update status, use error message if exists
        streaming[device.deviceId].status =
            device.error ? device.error : device.serverConnectionStatus;
      }
    });

    Object.keys(streaming).forEach(deviceId => {
      let isStillConnected = this.props.bleDeviceManager.enumerateDevices().some(
        device => device.deviceId === deviceId && device.state !== 'disconnected'
      );
      if (!isStillConnected) {
        // Streaming widget still exists, but we are no longer connected
        // to the peripheral. Let's do some cleanup...

        // No longer receiving status update (over BLE), so clear status to not
        // show potentially stale data
        streaming[deviceId].status = '';

        // We have not received a server-sent event. Delete placeholder widget,
        // less, it will linger indefinitely. If/when the server sends the
        // event, it will get added back in.
        if (streaming[deviceId].placeholder) {
          delete streaming[deviceId];
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
