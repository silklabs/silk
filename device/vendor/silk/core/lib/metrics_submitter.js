/**
 * Glue to submit metrics only when online.
 *
 * @flow
 */

import api from './api';
import createLog from './log';

import type NetworkStatus from './network_status';

const log = createLog('metrics_submitter');

const SUBMIT_INTERVAL = 1000 * 60; // Every 60 seconds.

export default function(networkStatus: NetworkStatus) {
  let timerId;

  async function submit() {
    log.info('Submitting metrics');
    try {
      await api.deviceMetrics.submit();
    } catch (err) {
      log.error(`Failed to submit metrics: ${err.stack}`);
    }

    // ensure there is no previous timer...
    if (timerId || timerId === 0) {
      clearTimeout(timerId);
    }

    timerId = setTimeout(submit, SUBMIT_INTERVAL);
    log.info(`Successfully submitted metrics will submit again in ${SUBMIT_INTERVAL} ms`);
  }

  networkStatus.on('online', submit);
  networkStatus.on('offline', () => {
    if (timerId || timerId === 0) {
      log.info('Going offline will not submit metrics until online...');
      clearTimeout(timerId);
      timerId = null;
    }
  });

  if (networkStatus.online) {
    submit();
  }
}
