/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

import Api from '../libraries/Api';

class CrashReports {
  static STORAGE_KEY = 'crashreports-old-reports';

  constructor() {
    this.deviceCrashesPromises = { }; // deviceId -> Promise
    this.oldReports =
      JSON.parse(localStorage.getItem(CrashReports.STORAGE_KEY) || '{}');
  }

  ensureDeviceCrashReports(deviceId) {
    if (!(deviceId in this.deviceCrashesPromises)) {
      this.deviceCrashesPromises[deviceId] = Api.crashMeta.find({ deviceId });
    }
    return this.deviceCrashesPromises[deviceId];
  }
 
  findByDeviceId(deviceId) {
    return this.ensureDeviceCrashReports(deviceId)
      .then(crashes => {
        crashes.forEach(crash => crash.old = (crash.id in this.oldReports));
        return crashes;
      });
  }

  setCrashesState(old, crashes) {
    crashes.forEach(crash => {
      if (old) {
        this.oldReports[crash.id] = 1;
      } else {
        delete this.oldReports[crash.id];
      }
    });
    localStorage.setItem(CrashReports.STORAGE_KEY,
                         JSON.stringify(this.oldReports));
  }
}

let reports = new CrashReports();
export default reports;
