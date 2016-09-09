/**
 * Business logic that's common to Silk clients (app, SDK, eventually
 * hoepfully also the webapp). This is generally expressed in the form of
 *
 * @flow
 */

import invariant from 'assert';
import {NativeModules, NetInfo} from 'react-native';
import getSocketManager from 'silk-ble-socket';
import createLog from 'silk-log';

import DeviceSession from './ble/device_session';
import * as actions from './store/actions';

import type {Socket} from 'silk-ble-socket';
import type {Store} from './store';

const RTC_SIGNAL_INTERVALS_SEC = [0, 5, 10, 20, 30];

const log = createLog('app-sdk-client');

/**
 * Automation for app initialization and network connectivity.
 */
function initNetworkAndAPI(store: Store<*>) {
  log.debug('initNetworkAndAPI');

  let networkConnectivitySubscription = null;
  function checkNetworkConnectivity() {
    store.dispatch(actions.network.canReachServer());
  }

  // (Re-)initialize the SilkApi and hook up network connectivity
  // events from the operating system to the store when the app config
  // is loaded or updated (e.g. via config.local.json, local
  // customizations, etc.)
  store.subscribeToPath('config', (config, oldConfig) => {
    if (!config.user) {
      // Don't do anything until we've restored user config.
      return;
    }
    if (oldConfig.user &&
        oldConfig.current &&
        config.current.serverUrl === oldConfig.current.serverUrl) {
      return;
    }
    store.dispatch(actions.api.create({
      serverUrl: config.current.serverUrl,
      metrics: {
        type: 'account',
        tags: {},
      },
    }));
    store.dispatch(actions.auth.restore());

    if (networkConnectivitySubscription === null) {
      networkConnectivitySubscription = NetInfo.isConnected.addEventListener(
        'change',
        checkNetworkConnectivity
      );
    }
    checkNetworkConnectivity();
  });
}

/**
 * Automation for interacting with registered devices, such
 * maintaining a list of them, connecting to them, etc.
 */
function initRegisteredDevices(store: Store<*>) {
  log.debug('initRegisteredDevices');

  // Ensure we have the latest list of devices, and are attempting to
  // signal them, when the circumstances call for it. For instance,
  // right after logging in, right after the phone's network
  // connection is restored, etc.
  let rtcTimers: Map<string, number> = new Map();

  function ensureDeviceConnection() {
    const {auth, network} = store.getState();
    if (!auth.isAuthenticated || !network.canReachServer) {
      rtcTimers.forEach(clearTimeout);
      rtcTimers.clear();
      return;
    }

    // See if there are any new devices.
    store.dispatch(actions.devices.registered.fetchList());
  }
  store.subscribeToPath('auth.isAuthenticated', ensureDeviceConnection);
  store.subscribeToPath('network.canReachServer', ensureDeviceConnection);

  // Whenever a new registered device gets added to the current state,
  // attempt to signal it immediately.
  const {rtc} = actions.devices;
  store.subscribeToPath('devices.registered', (newDevices, oldDevices) => {
    if (!newDevices) {
      return;
    }
    newDevices.forEach((newDevice, deviceId) => {
      const oldDevice = oldDevices ? oldDevices.get(deviceId) : null;

      // Newly added device, signal it right away.
      if (!oldDevice) {
        store.dispatch(rtc.signal(deviceId));
        return;
      }

      // We've failed to signal the device once again, re-attempt
      // based on back-off intervals.
      if (newDevice.rtc.attempts > oldDevice.rtc.attempts &&
          !newDevice.rtc.connecting &&
          !rtcTimers.has(deviceId)) {
        const index = Math.min(
          newDevice.rtc.attempts,
          RTC_SIGNAL_INTERVALS_SEC.length - 1
        );
        const intervalMS = RTC_SIGNAL_INTERVALS_SEC[index] * 1000;
        log.debug(`Attempting reconnection to ${deviceId} in ${intervalMS}ms`);

        const timer = setTimeout(() => {
          rtcTimers.delete(deviceId);
          const currentDevice = store.getState().devices.registered.get(deviceId);
          if (currentDevice.rtc.peer || currentDevice.rtc.connecting) {
            return;
          }
          log.debug(`Attempt #${currentDevice.rtc.attempts} to connect to ${deviceId}.`);
          store.dispatch(rtc.signal(deviceId));
        }, intervalMS);
        rtcTimers.set(deviceId, timer);
      }

      if (oldDevice.ble.unauthorized &&
          newDevice.ble.unauthorized === false &&
          newDevice.rtc.unauthorized) {
        // We just paired with this device over BLE. This means we
        // should now be able to connect to it via WebRTC. And we can
        // disconnect from BLE.
        clearTimeout(rtcTimers.get(deviceId));
        store.dispatch(rtc.signal(deviceId));
      }

      // Newly established connection, make sure we update state when
      // it's torn down.
      const oldPeer = oldDevice.rtc.peer;
      const newPeer = newDevice.rtc.peer;
      if (!oldPeer && newPeer) {
        newPeer.on('close', () => {
          store.dispatch(rtc.connectionClosed(deviceId));
          // Try reconnecting right away.
          store.dispatch(rtc.signal(deviceId));
        });
      }
    });
  });
}

/**
 * Automation for the device setup process.
 */
function initDeviceConfig(store: Store<*>) {
  log.debug('initDeviceConfig');

  // Whenever the UI has provided the config settings for the device
  // currently being configured, register the device with the server.
  store.subscribeToPath('devices.configuring.config', (config, _, state) => {
    if (!config) {
      return;
    }

    const {configuring, unconfigured} = state.devices;
    invariant(configuring);

    const session = unconfigured.get(configuring.socketId);
    invariant(session);

    store.dispatch(actions.devices.config.registerWithServer({
      devicePublicKey: configuring.secret.deviceId,
      type: session.model,
      name: configuring.config.name,
    }));
  });

  // When a new device has been registered with the server, send the
  // device configuration and registration information to it.
  store.subscribeToPath('devices.configuring.serverRegistrationResult', (result, _, state) => {
    if (!result) {
      return;
    }

    const {api, devices} = state;
    const {config} = devices.configuring;
    invariant(api);
    invariant(api.accessToken);
    invariant(config);
    store.dispatch(actions.devices.config.sendConfig({
      accessPoint: config.wifiSSID,
      password: config.wifiPassword,
      publicKey: api.accessToken.pub,
      regToken: result.registrationToken,
      serverUrl: api.config.serverUrl,
      time: Date.now(),
      timezoneOffset: (new Date()).getTimezoneOffset(),
    }));
  });
}

/**
 * Connect the BLE state machine in DeviceSession to the store.
 */
function initBLE(store: Store<*>) {
  log.debug('initBLE');

  const {BLESocketManager} = NativeModules;

  store.subscribeToPath('auth.beaconUuid', (beaconUuid, oldBeaconUuid, state, oldState) => {
    if (beaconUuid) {
      invariant(state.auth.isAuthenticated);

      log.debug('Enabling BLESocketManager');
      BLESocketManager.start();

      log.debug('Monitoring account uuid beacon', beaconUuid);
      BLESocketManager.addBeaconUuid(beaconUuid);
      return;
    }

    // Stop scanning for all devices when we're logging out.
    invariant(!state.auth.isAuthenticated);

    if (oldBeaconUuid) {
      log.debug('No longer monitoring account uuid beacon', oldBeaconUuid);
      const oldDevices = oldState.devices.registered;
      if (oldDevices) {
        oldDevices.forEach((oldDevice) => {
          if (!oldDevice.ble.connectionRequested) {
            return;
          }
          const {accountDeviceNumber} = oldDevice;
          BLESocketManager.scanForDevice(
            oldBeaconUuid,
            accountDeviceNumber,
            false
          );
        });
      }
    }

    log.debug('Disabling BLESocketManager');
    BLESocketManager.removeAllBeaconUuids();
    BLESocketManager.stop();
  });

  store.subscribeToPath('devices.registered', (newDevices, oldDevices, state) => {
    const lostDeviceNumbers: Set<number> = new Set();
    if (oldDevices) {
      oldDevices.forEach((oldDevice) => {
        if (oldDevice.ble.connectionRequested) {
          lostDeviceNumbers.add(oldDevice.accountDeviceNumber);
        }
      });
    }

    if (newDevices) {
      newDevices.forEach((newDevice, deviceId) => {
        if (!newDevice.ble.connectionRequested) {
          return;
        }

        const {accountDeviceNumber} = newDevice;
        lostDeviceNumbers.delete(accountDeviceNumber);

        const oldDevice = oldDevices ? oldDevices.get(deviceId) : null;
        if (oldDevice && oldDevice.ble.connectionRequested) {
          return;
        }

        log.debug('Connection requested for device ' + accountDeviceNumber);
        BLESocketManager.scanForDevice(
          state.auth.beaconUuid,
          accountDeviceNumber,
          true
        );
      });
    }

    lostDeviceNumbers.forEach((accountDeviceNumber) => {
      log.debug('Connection no longer requested for device ' + accountDeviceNumber);
      BLESocketManager.scanForDevice(
        state.auth.beaconUuid,
        accountDeviceNumber,
        false
      );
    });
  });

  const {ble, config} = actions.devices;
  const {dispatch} = store;

  function onSocketConnect(socket: Socket) {
    const {api, devices} = store.getState();
    const registeredDevices = devices.registered ?
      Array.from(devices.registered.values()) :
      [];
    const pubKeys = registeredDevices.map((device) => device.publicKey);
    const session = new DeviceSession(socket, api, pubKeys);

    let sessionIsConfig = false;

    session.on('connect', () => {
      if (session.isRegistered) {
        invariant(session.authenticated);
      } else {
        sessionIsConfig = true;
      }
      dispatch(ble.connected(session));
    });
    session.on('disconnect', () => {
      session.removeAllListeners();
      dispatch(ble.disconnected(session));
    });
    session.on('secret', () => dispatch(config.passedProximity(session)));
    session.on('wifiscan', () => dispatch(config.wifiScanResults(session)));
    session.on('wifiinfo', () => dispatch(config.wifiInfo(session)));
    session.on('updateStatus', () => dispatch(config.updateStatus(session)));
    session.on('connectionStatus', (type, status) => {
      dispatch(config.connectionStatus(session));
      if (type === 'server' &&
          !status.isError &&
          status.message === 'connected') {
        if (sessionIsConfig) {
          session.dismiss();
          return;
        }
        const {registered} = store.getState().devices;
        const device =
          (session.deviceId && registered) ?
          registered.get(session.deviceId) :
          null;
        if (!device || !device.ble.connectionRequested) {
          session.disconnect();
        }
      }
    });
    session.on('registered', () => dispatch(config.registered(session)));
    session.on('error', () => dispatch(ble.error(session)));
  }

  getSocketManager().on('connect', onSocketConnect);
}

export function init(store: Store<*>) {
  log.debug('init');

  initNetworkAndAPI(store);
  initRegisteredDevices(store);
  initDeviceConfig(store);
  initBLE(store);
}
