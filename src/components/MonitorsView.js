/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

import React from 'react-native';
let {
  ActivityIndicatorIOS,
  AppStateIOS,
  PixelRatio,
  ScrollView,
  StyleSheet,
  Text,
  View,
} = React;

import createLog from 'log';
import { OrderedMap, OrderedSet, Map } from 'immutable';

import DeviceManager from '../libraries/btle/DeviceManager';
import SocketIO from '../libraries/SocketIO';

import Activity from './Activity';
import AsyncComponent from './AsyncComponent';
import ErrorBar from './ErrorBar';
import MonitorPreview from './MonitorPreview';
import { PlaceholderText } from './Text';
import MonitorFullscreen from './MonitorFullscreen';

const log = createLog('MonitorsView');

const EVENTS_PAGE_SIZE = 10;
const SCROLLVIEW_PTR_THRESHOLD = -50;
const SCROLLVIEW_INFINITE_THRESHOLD = 100;

// This is mostly a guestimate based on FUT hardware. Absolute values
// not important here, the ratio is what matters.
const DEFAULT_PREVIEW_WIDTH = 16;
const DEFAULT_PREVIEW_HEIGHT = 9;
const DEFAULT_PREVIEW_SIZE = {
  width: DEFAULT_PREVIEW_WIDTH,
  height: DEFAULT_PREVIEW_HEIGHT,
};

class MonitorsView extends AsyncComponent {

  static propTypes = {
    api: React.PropTypes.object.isRequired, // TODO: we can do better here
    hasNetwork: React.PropTypes.bool.isRequired,
    socket: React.PropTypes.instanceOf(SocketIO),
    connectionState: React.PropTypes.oneOf(['offline', 'connecting', 'connected']),
    bleDeviceManager: React.PropTypes.instanceOf(DeviceManager).isRequired,

    devices: React.PropTypes.instanceOf(OrderedMap),
    unconfiguredDevices: React.PropTypes.instanceOf(OrderedSet),
    configuringDevice: React.PropTypes.instanceOf(Map),
    configureDevice: React.PropTypes.func.isRequired,
  };

  state = {
    fullscreenDeviceId: null,
    fullscreenStartTime: null,

    eventsLoading: null, // 'newer', 'older', or null
    events: null,
    eventsLatest: null,
    eventsEarliest: null,
    eventsError: null,
  };

  mounted = false;

  componentWillMount() {
    AppStateIOS.addEventListener('change', this.onAppStateChange);
    this.mounted = true;
  }

  componentWillUnmount() {
    AppStateIOS.removeEventListener('change', this.onAppStateChange);
    this.mounted = false;
  }

  componentWillReceiveProps(nextProps) {
    let { devices } = this.props;
    if (devices === nextProps.devices) {
      return;
    }
    if (!devices || !nextProps.devices.keySeq().isSubset(devices.keySeq())) {
      // This is pretty crude. We could probably do something smarter
      // here and only load activities for the extra devices that got
      // added. But for now throw everything away and refetch all
      // activities every time we see a new device.
      this.setState({
        events: null,
        eventsLatest: null,
        eventsEarliest: null,
        eventsLoading: 'older',
      }).then(() => this._fetchActivity(null, Date.now()));
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

  _getPreviewSize(deviceId) {
    let device = this.props.devices.get(deviceId);
    if (device &&
        device.get('previewSize') &&
        device.get('previewSize').width &&
        device.get('previewSize').height) {
      return device.get('previewSize');
    }
    return DEFAULT_PREVIEW_SIZE;
  }

  _getDeviceName(deviceId) {
    let device = this.props.devices.get(deviceId);
    return device ? device.get('name') : 'unknown device';
  }

  render() {
    let {
      connectionState,
      devices,
      unconfiguredDevices,
      configuringDevice,
    } = this.props;

    // this.props.devices === null means we haven't fetched a list of devices yet,
    // so we're still loading from network.
    if (connectionState === 'connecting' || !devices) {
      return this._renderSpinner();
    }

    if (!devices.size && !unconfiguredDevices.size && !configuringDevice) {
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
            {this._renderDeviceThumbnails()}
            {devices.size ? this._renderActivity() : null}
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

  _renderDeviceThumbnails() {
    let { devices, unconfiguredDevices, configuringDevice } = this.props;

    let unconfiguredDeviceThumbnails = unconfiguredDevices.map((peripheralId) => {
      if (configuringDevice && configuringDevice.get('peripheralId') === peripheralId) {
        return null;
      }
      return (
        <MonitorPreview
          key={peripheralId}
          peripheralId={peripheralId}
          label="New Device"
          previewSize={DEFAULT_PREVIEW_SIZE}
          configurable={true}
          configuring={false}
          onPress={() => this.props.configureDevice(peripheralId)}
          socket={this.props.socket}
          bleDeviceManager={this.props.bleDeviceManager}
        />
      );
    }).toArray().reverse();

    let configuringDeviceThumbnail = null;
    if (configuringDevice) {
      configuringDeviceThumbnail = (
        <MonitorPreview
          key={configuringDevice.get('peripheralId')}
          peripheralId={configuringDevice.get('peripheralId')}
          label={configuringDevice.get('name') || 'New Device'}
          previewSize={DEFAULT_PREVIEW_SIZE}
          configurable={false}
          configuring={true}
          onPress={null}
          socket={this.props.socket}
          bleDeviceManager={this.props.bleDeviceManager}
        />
      );
    }

    let deviceThumbnails = devices.map((device, deviceId) => (
      <MonitorPreview
        key={deviceId}
        deviceId={deviceId}
        label={device.get('name')}
        logo={device.get('logo')}
        previewSize={this._getPreviewSize(deviceId)}
        configurable={false}
        configuring={false}
        onPress={() => this.startFullscreenVideo(deviceId)}
        socket={this.props.socket}
        bleDeviceManager={this.props.bleDeviceManager}
      />
    )).toArray().reverse();

    return [
      unconfiguredDeviceThumbnails,
      configuringDeviceThumbnail,
      deviceThumbnails,
    ];
  }

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
    if (!this.props.hasNetwork || !this.props.devices.size) {
      // No point in trying anything when there's no network connectivity
      // or no devices.
      this.setStateAsync({eventsLoading: null});
      return;
    }

    let addlEvents;
    try {
      if (startTime === null) {
        addlEvents = await this.props.api.timeMeta.findBeforeTime({
          deviceIds: [...this.props.devices.keys()],
          time: endTime,
          metaType: 'event',
          maxCount: EVENTS_PAGE_SIZE,
        });
      } else {
        addlEvents = await this.props.api.timeMeta.findInTimeInterval({
          deviceIds: [...this.props.devices.keys()],
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
          api={this.props.api}
          hasNetwork={this.props.hasNetwork}
          key={event.id || event._id}
          actor={this._getDeviceName(event.deviceId)}
          event={event}
          previewSize={this._getPreviewSize(event.deviceId)}
          startFullscreenVideo={this.startFullscreenVideo}
        />
      ));
    }

    return [
      spinnerNewer,
      activity,
      spinnerOlder,
    ];
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
