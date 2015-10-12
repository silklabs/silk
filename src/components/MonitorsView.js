/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

import React from 'react-native';
var {
  ActivityIndicatorIOS,
  PixelRatio,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} = React;

import mklog from 'log'; const log = mklog('MonitorPreview');

import Activity from './Activity';
import AsyncComponent from './AsyncComponent';
import DeviceSetup from './DeviceSetup';
import { MonitorConnecting, MonitorPreview } from './MonitorPreview';
import { PlaceholderText } from './Text';
import MonitorFullscreen from './MonitorFullscreen';

const PERIPH_EVENTS = [
  'discover',
  'connect',
  'rssi',
  'stateChange',
  'disconnect',
  'errorChange',
  'statusChange',
];

const EVENTS_PAGE_SIZE = 10;
const SCROLLVIEW_PTR_THRESHOLD = -50;
const SCROLLVIEW_INFINITE_THRESHOLD = 100;

class MonitorsView extends AsyncComponent {

  state = {
    configuring: {},
    streaming: {},
    fullscreenDeviceId: null,
    fullscreenStartTime: null,

    eventsLoading: null,
    events: null,
    eventsLatest: null,
    eventsEarliest: null,
    eventsError: null,
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

  startFullscreenVideo = (fullscreenDeviceId, fullscreenStartTime = null) => {
    this.setState({fullscreenDeviceId, fullscreenStartTime});
  };

  stopFullscreenVideo = () => {
    this.setState({fullscreenDeviceId: null, fullscreenStartTime: null});
  };

  _getPreviewSize(deviceId) {
    let device = this.state.streaming[deviceId];
    return device ? device.previewSize : null;
  }

  _getDeviceName(deviceId) {
    let device = this.state.streaming[deviceId];
    return device ? device.name : 'unknown device';
  }

  render() {
    // Right now there's no stateful list of cameras, we only know
    // about them through Bluetooth or socket.io connections. In the
    // near future, we will just query the account.
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
          onPress={() => this.startFullscreenVideo(deviceId)}
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
      configuring = this._renderPlaceholder();
    }
    let activity;
    if (streaming.length !== 0) {
      activity = this._renderActivity();
    }

    let fullscreenMonitor = null;
    let { fullscreenDeviceId } = this.state;
    if (fullscreenDeviceId) {
      fullscreenMonitor = (
        <MonitorFullscreen
          {...this.props}
          onClose={this.stopFullscreenVideo}
          deviceId={fullscreenDeviceId}
          previewSize={this._getPreviewSize(fullscreenDeviceId)}
          startAtTime={this.state.fullscreenStartTime}
        />
      );
    }

    return (
      <View style={styles.content}>
        {fullscreenMonitor}
        <ScrollView
          style={styles.monitors}
          automaticallyAdjustContentInsets={true}
          scrollEventThrottle={5}
          onScroll={this.onScroll}>
          {configuring}
          {streaming}
          {activity}
        </ScrollView>
      </View>
    );
  }

  _renderPlaceholder() {
    return (
      <View style={styles.placeholderContainer}>
        <PlaceholderText>
          Connect Silk Cam to get started
        </PlaceholderText>
      </View>
    );
  }

  // Socket.io subscriptions

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

  onVideoStreamNew = async (msg) => {
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

    // This is pretty crude, but we have no other way of knowing which devices
    // to get activities for until we have devices connected to accounts.
    // So for now refetch all activities every time we see a new device.
    this.state.events = this.state.eventsLatest = this.state.eventsEarliest = null;
    this.state.eventsLoading = 'older';
    await this.setStateAsync(this.state);
    await this._fetchActivity(null, Date.now());
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

  // Activity feed management

  onScroll = async (event) => {
    let { eventsLoading, eventsLatest, eventsEarliest } = this.state;
    if (eventsLoading || eventsLatest === null || eventsEarliest === null) {
      return;
    }

    let { contentOffset, layoutMeasurement, contentSize } = event.nativeEvent;

    // Pull to refresh: fetch more recent events.
    if (contentOffset.y < SCROLLVIEW_PTR_THRESHOLD) {
      this.setStateAsync({eventsLoading: 'newer'});
      await this._fetchActivity(eventsLatest, Date.now());
      return;
    }

    let leftToScroll = contentSize.height - layoutMeasurement.height - contentOffset.y;
    if (leftToScroll < SCROLLVIEW_INFINITE_THRESHOLD) {
      this.setStateAsync({eventsLoading: 'older'});
      console.log('eventsEarliest', eventsEarliest);
      await this._fetchActivity(null, eventsEarliest);
      return;
    }
  };

  _fetchActivity = async (startTime, endTime) => {
    let addlEvents;
    try {
      if (startTime === null) {
        addlEvents = await this.props.api.timeMeta.findBeforeTime({
          deviceIds: Object.keys(this.state.streaming),
          time: endTime,
          metaType: 'event',
          maxCount: EVENTS_PAGE_SIZE,
        });
      } else {
        addlEvents = await this.props.api.timeMeta.findInTimeInterval({
          deviceIds: Object.keys(this.state.streaming),
          startTime,
          endTime,
          metaType: 'event',
          maxCount: EVENTS_PAGE_SIZE,
        });
      }
    } catch (ex) {
      log.warn('Failed to load events', ex);
      this.setStateAsync({eventsLoading: null, eventsError: ex});
      return;
    }

    if (!addlEvents.length) {
      this.setStateAsync({eventsLoading: null});
      return;
    }
    let events = this.state.events;
    if (!events || !events.length) {
      events = addlEvents;
    } else if (events[0].startUTC > addlEvents[0].startUTC) {
      // We're adding older events (e.g. from infinite scrolling), so
      // add them to the bottom.
      events = events.concat(addlEvents);
    } else {
      // We're adding newer events (e.g. from pull-to-refresh), so add
      // them to the top.
      events = addlEvents.concat(events);
    }
    let newState = { eventsLoading: null, events };
    if (!this.state.eventsLatest || endTime > this.state.eventsLatest) {
      newState.eventsLatest = endTime;
    }
    if (!this.state.eventsEarliest || startTime < this.state.eventsEarliest) {
      newState.eventsEarliest = addlEvents[addlEvents.length - 1].startUTC - 1;
    }
    await this.setStateAsync(newState);
  };

  _renderActivity() {
    let { eventsLoading, events, eventsError } = this.state;
    let spinnerNewer = null;
    let spinnerOlder = null;
    if (eventsLoading) {
      let spinner = (
        <ActivityIndicatorIOS
          size="large"
          style={styles.activitySpinner}
        />
      );
      if (eventsLoading === 'newer') {
        spinnerNewer = spinner;
      }
      if (eventsLoading === 'older') {
        spinnerOlder = spinner;
      }
    }

    let activity = null;
    if (eventsError) {
      // TODO this shouldn't really be here, this should be a "toast"
      // or some other transient UI element.
      activity = (
        <Text>Failed to load activities.</Text>
      );
    } else if (!events) {
      activity = null;
    } else if (!events.length) {
      activity = (
        <Text>No activity registered yet.</Text>
      );
    } else {
      // TODO: insert labels for today, yesterday, etc.
      activity = events.map((event) => (
        <Activity
          key={event.id || event._id}
          actor={this._getDeviceName(event.deviceId)}
          event={event}
          previewSize={this._getPreviewSize(event.deviceId)}
          startFullscreenVideo={this.startFullscreenVideo}
        />
      ));
    }

    return (
      <View>
        {spinnerNewer}
        {activity}
        {spinnerOlder}
      </View>
    );
  }

}

const styles = StyleSheet.create({
  content: {
    borderColor: '#c8c7cc',
    borderTopWidth: 1 / PixelRatio.get(),
    backgroundColor: 'white',
    flex: 1,
  },

  placeholderContainer: {
    marginHorizontal: 8,
  },

  monitors: {
    paddingTop: 5,
    backgroundColor: '#efefef',
    flex: 1,
  },

  activitySpinner: {
    alignSelf: 'center',
    marginVertical: 16,
  },

  eventRow: {
    padding: 10,
  },
});

module.exports = MonitorsView;
