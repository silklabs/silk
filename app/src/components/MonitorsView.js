/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

import React from 'react-native';
import createLog from 'log';
import { OrderedMap, OrderedSet } from 'immutable';
import { SilkApi } from 'silk-api';

import SocketIO from '../libraries/SocketIO';

import Activity from './Activity';
import AsyncComponent from './abstract/AsyncComponent';
import { ConfiguringDeviceRecord } from './abstract/Devices';
import ErrorBar from './ErrorBar';
import { PlaceholderText } from './Text';
import MonitorFullscreen from './MonitorFullscreen';
import PreviewThumbnails from './PreviewThumbnails';
import { DEFAULT_PREVIEW_SIZE } from './PreviewThumbnails';

const {
  ActivityIndicatorIOS,
  AppStateIOS,
  PixelRatio,
  ScrollView,
  StyleSheet,
  Text,
  View,
} = React;

const log = createLog('MonitorsView');

const EVENTS_PAGE_SIZE = 10;
const SCROLLVIEW_PTR_THRESHOLD = -50;
const SCROLLVIEW_INFINITE_THRESHOLD = 100;

class MonitorsView extends AsyncComponent {

  static propTypes = {
    api: React.PropTypes.instanceOf(SilkApi).isRequired,
    hasNetwork: React.PropTypes.bool.isRequired,
    socket: React.PropTypes.instanceOf(SocketIO),

    devices: React.PropTypes.instanceOf(OrderedMap),
    unconfiguredDevices: React.PropTypes.instanceOf(OrderedSet),
    configuringDevice: React.PropTypes.instanceOf(ConfiguringDeviceRecord),
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
        device.previewSize &&
        device.previewSize.width &&
        device.previewSize.height) {
      return device.previewSize;
    }
    return DEFAULT_PREVIEW_SIZE;
  }

  _getDeviceName(deviceId) {
    let device = this.props.devices.get(deviceId);
    return device ? device.name : 'unknown device';
  }

  render() {
    let {
      hasNetwork,
      devices,
      unconfiguredDevices,
      configuringDevice,
    } = this.props;

    // this.props.devices === null means we haven't fetched a list of devices yet,
    // so we're still loading from network.
    if (!devices) {
      if (!hasNetwork) {
        return this._renderOffline();
      }
      return (
        <View style={styles.content}>
          {this._renderSpinner()}
        </View>
      );
    }

    if (!devices.size && !unconfiguredDevices.size && !configuringDevice) {
      return this._renderNoDevices();
    }

    let { fullscreenDeviceId, eventsLoading, eventsError } = this.state;

    let errorBar = null;
    if (this.props.hasNetwork && eventsError) {
      // Show an error bar if we couldn't fetch activity despite
      // having a network connection.
      let description = 'Could not fetch recent activity.';
      if (__DEV__) {
        if (eventsError.status) {
          description = `Server responded with HTTP status ${eventsError.status}`;
        } else if (eventsError.message) {
          description = eventsError.message;
        }
      }
      errorBar = (
        <ErrorBar
          heading="Something Went Wrong"
          description={description}
        />
      );
    }

    let fullscreenMonitor = null;
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
            style={styles.scrollView}
            automaticallyAdjustContentInsets={true}
            scrollEventThrottle={5}
            onScroll={this.onScroll}>
            {eventsLoading === 'newer' ? this._renderPTRSpinner() : null}
            <PreviewThumbnails
              {...this.props}
              startFullscreenVideo={this.startFullscreenVideo}
            />
            {devices.size ? this._renderActivity() : null}
            {eventsLoading === 'older' ? this._renderSpinner() : null}
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
      <ActivityIndicatorIOS
        size="large"
        style={styles.loadingSpinner}
      />
    );
  }

  _renderPTRSpinner() {
    return (
      <View style={styles.ptrSpinnerContainer}>
        {this._renderSpinner()}
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

  // Activity feed management

  // Only fire pull-to-refresh action once per pull. That way we don't
  // keep continuously firing the action.
  _pullToRefreshActive = false;

  onScroll = (event) => {
    let { eventsLoading, eventsLatest, eventsEarliest } = this.pendingState;
    if (eventsLoading || eventsLatest === null || eventsEarliest === null) {
      return;
    }

    let { contentOffset, layoutMeasurement, contentSize } = event.nativeEvent;

    // Pull to refresh: fetch more recent events.
    if (!this._pullToRefreshActive && contentOffset.y < SCROLLVIEW_PTR_THRESHOLD) {
      this._pullToRefreshActive = true;
      this.setStateAsync({eventsLoading: 'newer'});
      this._fetchActivity(eventsLatest, Date.now());
      return;
    }

    if (this._pullToRefreshActive && contentOffset.y === 0) {
      this._pullToRefreshActive = false;
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
        addlEvents = await this.props.api.metadata.findAllBeforeTime({
          deviceIds: [...this.props.devices.keys()],
          time: endTime,
          metaType: 'event',
          maxCount: EVENTS_PAGE_SIZE,
        });
      } else {
        addlEvents = await this.props.api.metadata.findAllInTimeInterval({
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
    let { events } = this.state;
    if (!events) {
      return null;
    }
    if (!events.length) {
      return <Text>No activity registered yet.</Text>;
    }
    return events.map((event) => (
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

  scrollView: {
    paddingTop: 5,
    backgroundColor: '#efefef',
    flex: 1,
  },

  loadingSpinner: {
    alignSelf: 'center',
    marginVertical: 16,
  },

  ptrSpinnerContainer: {
    position: 'absolute',
    top: SCROLLVIEW_PTR_THRESHOLD - 10,
    left: 0,
    right: 0,
    height: -SCROLLVIEW_PTR_THRESHOLD,
  },

  eventRow: {
    padding: 10,
  },
});

module.exports = MonitorsView;
