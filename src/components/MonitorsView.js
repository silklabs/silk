/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

import React from 'react-native';
let {
  ActivityIndicatorIOS,
  AlertIOS,
  AppStateIOS,
  InteractionManager,
  PixelRatio,
  ScrollView,
  StyleSheet,
  Text,
  View,
} = React;

import createLog from 'log';

import BLECentral from '../libraries/btle/BLECentral';
import DeviceManager from '../libraries/btle/DeviceManager';
import SocketIO from '../libraries/SocketIO';

import Activity from './Activity';
import AsyncComponent from './AsyncComponent';
import ErrorBar from './ErrorBar';
import MonitorPreview from './MonitorPreview';
import { PlaceholderText } from './Text';
import MonitorFullscreen from './MonitorFullscreen';

const log = createLog('MonitorsView');

const PERIPH_EVENTS = [
  'discover',
  'connect',
  'stateChange',
  'disconnect',
  'errorChange',
  'statusChange',
];

const EVENTS_PAGE_SIZE = 10;
const SCROLLVIEW_PTR_THRESHOLD = -50;
const SCROLLVIEW_INFINITE_THRESHOLD = 100;
const AFTER_TOUCH_WAIT_MS = 500;
const SOCKET_CONNECT_DEVICE_LIST_TIMEOUT_MS = 1000;
const NEW_DEVICE_CONNECTION_TIMEOUT_MS = 5000;

// This is mostly a guestimate based on FUT hardware. Absolute values
// not important here, the ratio is what matters.
const DEFAULT_PREVIEW_WIDTH = 16;
const DEFAULT_PREVIEW_HEIGHT = 9;

class MonitorsView extends AsyncComponent {

  static propTypes = {
    api: React.PropTypes.object.isRequired, // TODO: we can do better here
    hasNetwork: React.PropTypes.bool.isRequired,
    socket: React.PropTypes.instanceOf(SocketIO),
    connectionState: React.PropTypes.oneOf(['offline', 'connecting', 'connected']),
  };

  state = {
    waitingForDevices: false,
    devices: {},
    fullscreenDeviceId: null,
    fullscreenStartTime: null,

    eventsLoading: null, // 'newer', 'older', or null
    events: null,
    eventsLatest: null,
    eventsEarliest: null,
    eventsError: null,
  };

  mounted = false;
  bleDeviceManager = null;

  componentWillMount() {
    this.bleDeviceManager = new DeviceManager(
      BLECentral,
      this.props.userState
    );
    PERIPH_EVENTS.forEach(ev => this.bleDeviceManager.on(ev, this.refreshDeviceList));
    this.bleDeviceManager.start();

    this.subscribeToSocket();
    AppStateIOS.addEventListener('change', this.onAppStateChange);
    this.mounted = true;
  }

  componentWillUnmount() {
    PERIPH_EVENTS.forEach(ev => this.bleDeviceManager.removeListener(ev, this.refreshDeviceList));
    AppStateIOS.removeEventListener('change', this.onAppStateChange);
    this.mounted = false;
  }

  componentWillReceiveProps(nextProps) {
    let newState = {};

    // Reset our UI state before we get the new socket so that we don't have
    // any children rendered that are still listening to the old socket.
    // Eventually, we should make those children smart and detect themselves
    // when the socket changes under them and unsubscribe + resubscribe.
    if (this.props.socket !== nextProps.socket) {
      newState.devices = {};
    }

    // Give the socket.io server some time to send us the list of devices.
    // During that time we want to appear as if we're still connecting.
    let { devices } = this.state;
    if (this.props.connectionState === 'connecting' &&
        nextProps.connectionState === 'connected' &&
        Object.keys(devices).length === 0) {
      newState.waitingForDevices = true;
      setTimeout(() => {
        this.mounted && this.setState({waitingForDevices: false});
      }, SOCKET_CONNECT_DEVICE_LIST_TIMEOUT_MS);
    }

    if (Object.keys(newState)) {
      this.setState(newState);
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

  onAppStateChange = (appState) => {
    if (appState === 'active' && this.state.eventsLatest) {
      // Refresh feed: fetch more recent events if there are any.
      this._fetchActivity(this.state.eventsLatest, Date.now());
    }
  };

  startFullscreenVideo = (fullscreenDeviceId, fullscreenStartTime = null) => {
    this.setState({fullscreenDeviceId, fullscreenStartTime});
  };

  stopFullscreenVideo = () => {
    this.setState({fullscreenDeviceId: null, fullscreenStartTime: null});
  };

  configureDevice(deviceId) {
    let device = this.state.devices[deviceId];
    if (!device) {
      this._showConfigError();
      return;
    }

    let canceled = false;
    let deviceTouchView = null;
    this.props.navigator.push({
      name: 'DeviceTouch',
      props: {
        deviceId,
        bleDeviceManager: this.bleDeviceManager,
        onCancel: () => this.props.navigator.popToTop(),
        // Keep a ref so that we can update the view when the devices touch.
        ref: (element) => deviceTouchView = element,
      },
    });
    InteractionManager.runAfterInteractions(() => {
      let device = this.state.devices[deviceId];
      device.configuring = true;
      this.setState({devices: this.state.devices});
    });

    this.bleDeviceManager.configureDevice(device.peripheralId, () => {
      return new Promise((resolve, reject) => {
        if (!deviceTouchView) {
          reject(new Error('Did not render the setup flow?'));
          return;
        }
        // Alright, we have achieved touch! Update the touch UI
        // briefly to let the user know they did it correctly.
        deviceTouchView.onDeviceTouch();
        deviceTouchView = null;

        // After a brief period of time, advance to the configuration
        // screen where the user can enter device name, wifi
        // credentials, etc.
        setTimeout(() => this.props.navigator.push({
          name: 'DeviceConfig',
          props: {
            onCancel: () => {
              canceled = true;
              reject(new Error('User canceled.'));
              // We'll pop the views off the navigation stack below.
            },
            onSave: (config) => {
              this.props.navigator.popToTop();
              // Don't interfere with the navigation animation.
              InteractionManager.runAfterInteractions(() => {
                // Update the name of the new device in the UI.
                let device = this.state.devices[deviceId];
                if (!device) {
                  reject(new Error('Device record no longer found, are we still connected?'));
                  return;
                }
                device.name = config.name;
                this.setStateAsync({devices: this.state.devices});

                // And finally, configure the device.
                resolve(config);
              });
            },
          },
        }), AFTER_TOUCH_WAIT_MS);
      });
    }).catch((err) => {
      log.info('Could not configure device', err);
      this.props.navigator.popToTop();
      if (!canceled) {
        // Don't interfere with the navigation animation.
        InteractionManager.runAfterInteractions(() => this._showConfigError());
      }
    });
  }

  _showConfigError() {
    AlertIOS.alert(
      'Error Configuring Device',
      'The device could not be configured. Ensure that it is turned on and nearby.'
    );
  }

  _getPreviewSize(deviceId) {
    let device = this.state.devices[deviceId];
    if (device &&
        device.previewSize &&
        device.previewSize.width &&
        device.previewSize.height) {
      return device.previewSize;
    }
    return {
      width: DEFAULT_PREVIEW_WIDTH,
      height: DEFAULT_PREVIEW_HEIGHT,
    };
  }

  _getDeviceName(deviceId) {
    let device = this.state.devices[deviceId];
    return device ? device.name : 'unknown device';
  }

  render() {
    let { connectionState } = this.props;
    if (connectionState === 'connecting' || this.state.waitingForDevices) {
      return this._renderSpinner();
    }

    let deviceIds = Object.keys(this.state.devices);
    if (0 === deviceIds.length) {
      if (connectionState === 'offline') {
        return this._renderOffline();
      }
      return this._renderNoDevices();
    }

    let errorBar = null;
    if (this.props.hasNetwork && this.state.eventsError) {
      // Show an error bar if we couldn't fetch activity despite
      // having a network connection.
      errorBar = (
        <ErrorBar
          heading="Something Went Wrong"
          description="Could not fetch recent activity."
        />
      );
    }

    // Right now there's no stateful list of cameras, we only know
    // about them through Bluetooth or socket.io connections. In the
    // near future, we will just query the account.
    let devices = deviceIds.map(deviceId => {
      let device = this.state.devices[deviceId];
      let onPress;
      if (device.configuring) {
        onPress = null;
      } else if (device.unconfigured) {
        onPress = () => this.configureDevice(deviceId);
      } else {
        onPress = () => this.startFullscreenVideo(deviceId);
      }
      return (
        <MonitorPreview
          key={deviceId}
          onPress={onPress}
          deviceId={deviceId}
          label={device.name}
          configurable={device.unconfigured && !device.configuring}
          serverConnectionStatus={device.serverConnectionStatus}
          logo={device.logo}
          previewSize={this._getPreviewSize(deviceId)}
          {...this.props}
        />
      );
    });
    let configuredDevices = deviceIds.filter(
      deviceId => !this.state.devices[deviceId].unconfigured
    );
    let activity = configuredDevices.length ? this._renderActivity() : null;
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
      <View style={styles.wrapper}>
        {fullscreenMonitor}
        {errorBar}
        <View style={styles.content}>
          <ScrollView
            style={styles.monitors}
            automaticallyAdjustContentInsets={true}
            scrollEventThrottle={5}
            onScroll={this.onScroll}>
            {devices}
            {activity}
          </ScrollView>
        </View>
      </View>
    );
  }

  _renderOffline() {
    return (
      <View style={styles.content}>
        <View style={styles.placeholderContainer}>
          <PlaceholderText>
            Not connected.
          </PlaceholderText>
        </View>
      </View>
    );
  }

  _renderSpinner() {
    return (
      <View style={styles.content}>
        <ActivityIndicatorIOS
          size="large"
          style={styles.loadingSpinner}
        />
      </View>
    );
  }

  _renderNoDevices() {
    return (
      <View style={styles.content}>
        <View style={styles.placeholderContainer}>
          <PlaceholderText>
            Turn on a Silk device to get started
          </PlaceholderText>
        </View>
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
    let device = this.state.devices[msg.id];
    let serverConnectionStatus = device && device.serverConnectionStatus || null;

    this.state.devices[msg.id] = {
      peripheralId: device && device.peripheralId || null,
      name: device && device.name || msg.name,
      logo: msg.logo,
      previewSize: msg.previewSize,
      serverConnectionStatus,
      unconfigured: false,
      configuring: false,
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
    delete this.state.devices[msg.id];
    this.mounted && this.setState({devices: this.state.devices});
  };

  refreshDeviceList = () => {
    if (!this.mounted) {
      return;
    }

    let dirtyState = false;
    let { devices } = this.state;
    let bleDevices = this.bleDeviceManager.enumerateDevices();
    bleDevices.forEach(peripheral => {
      if (!peripheral.deviceId) {
        // We haven't fetched the deviceId for the peripheral yet.
        // Ignore for now.
        // TODO: this is a problematic strategy:
        // https://github.com/silklabs/silk-server/issues/307
        return;
      }
      let existingRecord = devices[peripheral.deviceId];
      if (!existingRecord) {
        // Device has sent us its ID, but it hasn't been configured yet
        // or is still in the process of connecting to the
        // server. Create a placeholder widget for it that will be
        // swapped out once we get the device info from the server.
        log.info(`Detected new device with ID ${peripheral.id}, device ID ${peripheral.deviceId}`);
        existingRecord = devices[peripheral.deviceId] = {
          peripheralId: peripheral.id,
          name: 'New Device',
          logo: null,
          unconfigured: true,
          configuring: false,
        };
        dirtyState = true;
      }

      let serverConnectionStatus =
        peripheral.error ? peripheral.error : peripheral.serverConnectionStatus;
      if (existingRecord.serverConnectionStatus !== serverConnectionStatus) {
        existingRecord.serverConnectionStatus = serverConnectionStatus;
        dirtyState = true;
      }
    });

    let stillConnectedDeviceIds = bleDevices
      .filter(peripheral => peripheral.state !== 'disconnected')
      .map(peripheral => peripheral.deviceId);

    Object.keys(devices).forEach(deviceId => {
      let isStillConnected = deviceId.indexOf(stillConnectedDeviceIds) !== -1;
      if (isStillConnected) {
        return;
      }
      // Devices widget still exists, but we are no longer connected
      // to the peripheral over BLE. Let's do some cleanup...

      // No longer receiving status update (over BLE), so clear status to not
      // show potentially stale data
      if (devices[deviceId].serverConnectionStatus !== null) {
        devices[deviceId].serverConnectionStatus = null;
        dirtyState = true;
      }

      // We have not received a server-sent event. Give the device
      // some time to connect to the server. After that, delete
      // placeholder widget so it doesn't linger indefinitely.
      // See also https://github.com/silklabs/silk-device/issues/1006.
      if (devices[deviceId].unconfigured) {
        setTimeout(() => {
          if (!this.state.devices[deviceId] ||
              !this.state.devices[deviceId].unconfigured) {
            // Nothing to be done here.
            return;
          }
          delete this.state.devices[deviceId];
          this.mounted && this.setState({devices: this.state.devices});
        }, NEW_DEVICE_CONNECTION_TIMEOUT_MS);
      }
    });
    if (dirtyState) {
      this.setState({devices});
    }
  };

  // Activity feed management

  onScroll = (event) => {
    let { eventsLoading, eventsLatest, eventsEarliest } = this.state;
    if (eventsLoading || eventsLatest === null || eventsEarliest === null) {
      return;
    }

    let { contentOffset, layoutMeasurement, contentSize } = event.nativeEvent;

    // Pull to refresh: fetch more recent events.
    if (contentOffset.y < SCROLLVIEW_PTR_THRESHOLD) {
      this.setStateAsync({eventsLoading: 'newer'});
      this._fetchActivity(eventsLatest, Date.now());
      return;
    }

    // Infinite scroll: fetch more older events.
    let leftToScroll = contentSize.height - layoutMeasurement.height - contentOffset.y;
    if (leftToScroll < SCROLLVIEW_INFINITE_THRESHOLD) {
      this.setStateAsync({eventsLoading: 'older'});
      this._fetchActivity(null, eventsEarliest);
      return;
    }
  };

  _fetchActivity = async (startTime, endTime) => {
    if (!this.props.hasNetwork) {
      // No point in trying anything when there's no network connectivity.
      this.setStateAsync({eventsLoading: null});
      return;
    }

    let addlEvents;
    try {
      if (startTime === null) {
        addlEvents = await this.props.api.timeMeta.findBeforeTime({
          deviceIds: Object.keys(this.state.devices),
          time: endTime,
          metaType: 'event',
          maxCount: EVENTS_PAGE_SIZE,
        });
      } else {
        addlEvents = await this.props.api.timeMeta.findInTimeInterval({
          deviceIds: Object.keys(this.state.devices),
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

    if (!this.mounted) {
      return;
    }

    if (!addlEvents.length) {
      this.setStateAsync({eventsLoading: null, eventsError: null});
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
    let newState = {
      eventsLoading: null,
      eventsError: null,
      events,
    };
    if (!this.state.eventsLatest || endTime > this.state.eventsLatest) {
      newState.eventsLatest = endTime;
    }
    if (!this.state.eventsEarliest || startTime < this.state.eventsEarliest) {
      newState.eventsEarliest = addlEvents[addlEvents.length - 1].startUTC - 1;
    }
    await this.setStateAsync(newState);
  };

  _renderActivity() {
    let { eventsLoading, events } = this.state;
    let spinnerNewer = null;
    let spinnerOlder = null;
    if (eventsLoading) {
      let spinner = (
        <ActivityIndicatorIOS
          size="large"
          style={styles.loadingSpinner}
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
    if (!events) {
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
  wrapper: {
    flex: 1,
  },

  content: {
    borderColor: '#c8c7cc',
    borderTopWidth: 1 / PixelRatio.get(),
    backgroundColor: 'white',
    flex: 1,
  },

  placeholderContainer: {
    margin: 8,
  },

  monitors: {
    paddingTop: 5,
    backgroundColor: '#efefef',
    flex: 1,
  },

  loadingSpinner: {
    alignSelf: 'center',
    marginVertical: 16,
  },

  eventRow: {
    padding: 10,
  },
});

module.exports = MonitorsView;
