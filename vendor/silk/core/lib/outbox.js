/**
 * Copyright (c) 2015 Silk Laboratories, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Laboratories, Inc.
 */

/**
 * Helper to initialize outbox and various operations...
 */
import path from 'path';
import createOutbox from './outbox/manager';

import CrashReportOp from './outbox/crash_report_operation';

const STORAGE_PATH = path.join('/data', 'outbox');

export default function(wifi) {
  let outbox = createOutbox({
    storagePath: STORAGE_PATH
  });

  /**
   * Register all known operations so we can create them from disk as needed...
   */
  outbox.registerOperation(CrashReportOp);

  // Optimistically start running pending operations...
  let online = wifi.isOnline();
  outbox.online = online;

  // Do not poll for work unless we are actively online...
  if (online) {
    outbox.start();
  }

  wifi.on('online', () => {
    outbox.online = true;
    outbox.start();
  });

  wifi.on('offline', () => {
    outbox.online = false;
    outbox.stop();
  });

  return outbox;
}
