/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

// XXX: Nasty hack to load localforage it does not load as a normal
// es6 module sadly with webpack...
require('script!localforage');
const localforage = window.localforage;

import Api from '../libraries/Api';
import assert from 'assert';

function errorHandler(err) {
  console.error(err);
}

class CrashReports {
  static STORAGE_PREFIX = 'crashreports-';
  static DEVICE_CACHE_METADATA = 'crashreports-metadata';

  metadata = null;
  initPromise = null;

  // This gets serialized to disk.
  reports = {}; // deviceId -> Array of crash reports

  // This is just an in-memory map to update properties on the reports from the
  // UI.
  reportIdMap = {}; // deviceId -> { reportId: report }

  // Properties that get added to all new reports.
  newFetchedReportProperties = {
    old: false,
  };

  constructor() {
    this.initPromise = localforage.getItem(CrashReports.DEVICE_CACHE_METADATA)
      .then(metadata => {
        // Convert date strings back into real Date objects.
        if (metadata) {
          for (let deviceId in metadata) {
            metadata[deviceId].lastSyncTime =
              new Date(metadata[deviceId].lastSyncTime);
          }
          this.metadata = metadata;
        } else {
          this.metadata = {};
        }
      });
  }

  loadReportsFromStorage(deviceId) {
    assert(this.metadata);

    // Only load from storage once and then cache in memory.
    if (deviceId in this.reports) {
      return Promise.resolve(this.reports[deviceId]);
    }

    this.reports[deviceId] = [];
    this.reportIdMap[deviceId] = {};

    // If this deviceId has an entry in our metadata then we know there should
    // be an entry in storage for its reports.
    if (deviceId in this.metadata) {
      return localforage.getItem(CrashReports.STORAGE_PREFIX + deviceId)
        .then(reports => {
          reports = reports || [];

          let idMap = {};
          reports.forEach(report => {
            idMap[report.id] = report;
          });

          this.reportIdMap[deviceId] = idMap;
          this.reports[deviceId] = reports;

          return this.reports[deviceId];
        });
    }

    return Promise.resolve([]);
  }

  fetchReportsFromServer(deviceId) {
    assert(this.metadata);

    let query = { deviceId };

    // If we have sync'd before then we only need to fetch reports newer than
    // the previous sync time.
    if (deviceId in this.metadata) {
      query.startTimeStamp = this.metadata[deviceId].lastSyncTime.toISOString();
    }

    return Api.crashMeta.find(query)
      .then(reports => {
        // Assign new metadata properties.
        reports.forEach(report => {
          Object.assign(report, this.newFetchedReportProperties);
        });
        return reports;
      });
  }

  saveMetadata(deviceId, reports) {
    assert(this.metadata);

    // Skip persisting the reports if nothing changed.
    let reportsPromise = reports ?
      localforage.setItem(CrashReports.STORAGE_PREFIX + deviceId, reports) :
      Promise.resolve();

    return reportsPromise
      .then(() => localforage.setItem(CrashReports.DEVICE_CACHE_METADATA,
                                      this.metadata));
  }

  gatherReports(deviceId) {
    assert(this.metadata);

    // This will be our new sync time. There is an inherent race here so we have
    // to handle duplicates below.
    let timeStamp = new Date();

    // Disk and network can run in parallel.
    return Promise.all([ this.loadReportsFromStorage(deviceId),
                         this.fetchReportsFromServer(deviceId) ])
      .then(reports => {
        let savedReports = reports[0];
        let fetchedReports = reports[1];

        // Record the sync time.
        if (deviceId in this.metadata) {
          this.metadata[deviceId].lastSyncTime = timeStamp;
        } else {
          this.metadata[deviceId] = {
            lastSyncTime: timeStamp,
          };
        }

        if (fetchedReports.length) {
          if (savedReports.length) {
            // If we had some reports already then we have to handle the
            // possibility that we received a few duplicate reports.
            let oldestFetchedReport = fetchedReports[fetchedReports.length - 1];
            for (let index = 0; index < savedReports.length; index++) {
              // Cut out any duplicate reports that the server just sent us.
              if (oldestFetchedReport.id === savedReports[index].id) {
                savedReports = savedReports.slice(index + 1);
                break;
              }
              // Stop iterating if the oldest report we just fetched is newer
              // than this saved report.
              if (oldestFetchedReport.timeStamp > savedReports[index].timeStamp) {
                break;
              }
            }
          }

          let idMap = this.reportIdMap[deviceId];
          fetchedReports.forEach(report => {
            idMap[report.id] = report;
          });

          savedReports = fetchedReports.concat(savedReports);

          // Save new reports to disk.
          this.saveMetadata(deviceId, savedReports).catch(errorHandler);
        } else {
          // Just update timestamp.
          this.saveMetadata(deviceId).catch(errorHandler);
        }

        this.reports[deviceId] = savedReports;
        return this.reports[deviceId];
      });
  }

  findByDeviceId(deviceId) {
    return this.initPromise
      .then(() => this.gatherReports(deviceId))
      .catch(errorHandler);
  }

  setCrashesState(deviceId, crashes, old) {
    return this.initPromise
      .then(() => {
        if (!crashes) {
          return Promise.resolve();
        }
        let idMap = this.reportIdMap[deviceId] || {};
        crashes.forEach(crash => {
          let report = idMap[crash.id];
          if (report) {
            report.old = old;
          }
        });
        return localforage.setItem(CrashReports.STORAGE_PREFIX + deviceId,
                                   this.reports[deviceId]);
      })
      .catch(errorHandler);
  }
}

let reports = new CrashReports();
export default reports;
