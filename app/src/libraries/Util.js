/**
 * @flow
 */

import { NativeModules } from 'react-native';

const { SLKUtil } = NativeModules;

export type WifiInfo = {
  SSID: string;
  BSSID: string;
};

/**
 * Get information about the WiFi network we're currently connected to.
 */
export function getWifiInfo(): Promise<?WifiInfo> {
  return SLKUtil.getWifiInfo();
}

/**
 * Cause the app to exit (= crash in a way that Raygun won't register
 * it as a crash).
 */
export function exitApp() {
  SLKUtil.exitApp();
}
