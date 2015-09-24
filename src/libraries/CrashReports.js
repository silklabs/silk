/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

// XXX: Nasty hack to load localforage it does not load as a normal
// es6 module sadly with webpack...
require('script!localforage');
const localforage = window.localforage;

import Api from '../libraries/Api';

class CrashReports {
  static STORAGE_KEY = 'crashreports-old-reports';

  constructor() {
    this.deviceCrashesPromises = { }; // deviceId -> Promise
    this.oldReportsPromise = localforage.getItem(CrashReports.STORAGE_KEY)
      .then(oldReports => {
        this.oldReports = oldReports || {};
      });
  }

  ensureDeviceCrashReports(deviceId) {
    if (!(deviceId in this.deviceCrashesPromises)) {
      this.deviceCrashesPromises[deviceId] = Api.crashMeta.find({ deviceId });
    }
    return this.deviceCrashesPromises[deviceId];
  }

  findByDeviceId(deviceId) {
    return this.oldReportsPromise
      .then(() => this.ensureDeviceCrashReports(deviceId))
      .then(crashes => {
        crashes.forEach(crash => crash.old = (crash.id in this.oldReports));
        return crashes;
      });
  }

  setCrashesState(old, crashes) {
    return this.oldReportsPromise
      .then(() => {
        crashes.forEach(crash => {
          if (old) {
            this.oldReports[crash.id] = 1;
          } else {
            delete this.oldReports[crash.id];
          }
        });
        return localforage.setItem(CrashReports.STORAGE_KEY, this.oldReports);
      });
  }
}

let reports = new CrashReports();
export default reports;
