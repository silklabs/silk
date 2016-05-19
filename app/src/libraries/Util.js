/**
 * @flow
 */

import { NativeModules, Platform } from 'react-native';

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

export type NativeBlob = {
  __native_type: 'Blob';
  id: string;
  length: number;
  firstByte?: number;
  offset?: number;
};

export function blobURI(blob: ?NativeBlob): ?string {
  if (!blob) {
    return null;
  }
  if (Platform.OS === 'ios') {
    let uri = `silk-blob://${blob.id}/`;
    if (blob.offset) {
      uri += `?offset=${blob.offset}`;
    }
    return uri;
  } else if (Platform.OS === 'android') {
    let uri = `content://com.silklabs.app.blobs/${blob.id}`;
    if (blob.offset) {
      uri += `?offset=${blob.offset}`;
    }
    return uri;
  }
  return null;
}
