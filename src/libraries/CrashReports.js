/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

import Api from '../libraries/Api';

class CrashReports {
  constructor() {
    this.deviceCrashesPromises = { }; // deviceId -> Promise
  }

  findByDeviceId(deviceId) {
    if (!(deviceId in this.deviceCrashesPromises)) {
      this.deviceCrashesPromises[deviceId] = Api.crashMeta.find({ deviceId });
    }
    return this.deviceCrashesPromises[deviceId];
  }
}

let reports = new CrashReports();
export default reports;
