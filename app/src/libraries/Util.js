/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

import { NativeModules } from 'react-native';
let { SLKUtil } = NativeModules;

export function getWifiInfo() {
  return new Promise((resolve, reject) => {
    return SLKUtil.getWifiInfo((err, info) => {
      return err ? reject(err) : resolve(info);
    });
  });
}

export function exitApp() {
  SLKUtil.exitApp();
}

