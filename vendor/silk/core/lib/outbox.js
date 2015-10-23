/**
 * Copyright (c) 2015 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

/**
 * Helper to initialize outbox and various operations...
 */
import path from 'path';
import createOutbox from './outbox/manager';

import CrashReportOp from './outbox/crash_report_operation';
import { VideoUploadOp, PreviewUploadOp } from './outbox/blob_upload_operation';
import PapertrailOp from './outbox/papertrail_operation';
import APICallOp from './outbox/api_call_operation';

const STORAGE_PATH = path.join('/data', 'outbox');

export default function(networkStatus) {
  let outbox = createOutbox({
    storagePath: STORAGE_PATH
  });

  /**
   * The outbox has special queues specific to blob uploads so we don't clog
   * up the main queue with video (which is running constantly).
   */
  outbox.registerQueue('video', {
    // TODO: This should be computed somehow
    concurrency: 3
  });
  outbox.registerQueue('preview');

  /**
   * Register all known operations so we can create them from disk as needed...
   */
  outbox.registerOperation(CrashReportOp);
  outbox.registerOperation(PapertrailOp);
  outbox.registerOperation(VideoUploadOp);
  outbox.registerOperation(PreviewUploadOp);
  outbox.registerOperation(APICallOp);

  // Optimistically start running pending operations...
  outbox.online = networkStatus.online;

  // Do not poll for work unless we are actively online...
  if (outbox.online) {
    outbox.start();
  }

  networkStatus.on('online', () => {
    outbox.online = true;
    outbox.start();
  });

  networkStatus.on('offline', () => {
    outbox.online = false;
    outbox.stop();
  });

  return outbox;
}
