/**
 * @flow
 */

import {NativeModules} from 'react-native';

export type WifiInfo = {
  SSID: string;
  BSSID: string;
};

export type DeviceInfo = {
  /**
   * Manufacturer of the device, e.g. "Apple", "motorala", etc.
   */
  manufacturer: string;

  /**
   * Device model, e.g. "iPod Touch", "Nexus 6", etc.
   */
  model: string;

  /**
   * Name of the device given by the user, e.g. "Ben's iPhone". This
   * is only available on iOS.
   */
  name: ?string;

  /**
   * OS name, e.g. "iOS" or "Android"
   */
  systemName: string;

  /**
   * OS version, e.g. "6.0.1"
   */
  systemVersion: string;
};

const {SLKUtil} = NativeModules;
const {manufacturer, model, name, systemName, systemVersion} = SLKUtil;

export const deviceInfo: DeviceInfo = {
  manufacturer,
  model,
  name,
  systemName,
  systemVersion,
};

/**
 * Get information about the WiFi network we're currently connected to.
 */
export function genWifiInfo(): Promise<?WifiInfo> {
  return SLKUtil.genWifiInfo();
}

/**
 * Cause the app to exit (= crash in a way that Raygun won't register
 * it as a crash).
 */
export function exitApp() {
  SLKUtil.exitApp();
}
