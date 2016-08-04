/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @private
 * @flow
 */

import { getOutboxInstance } from 'silk-outbox';

import {
  CrashReporterOperation,
  BlobUploadOperation,
  PapertrailOperation,
  APICallOperation,
} from 'silk-outbox';

import type { NetworkStatus } from 'silk-netstatus';
import type { Outbox } from 'silk-outbox';

export class VideoUploadOperation extends BlobUploadOperation {
  static NAME = 'video-upload';
  static META_TYPE = 'video';
  static CONTENT_TYPE = 'video/mp4';
}

export class PreviewUploadOperation extends BlobUploadOperation {
  static NAME = 'preview-upload';
  static META_TYPE = 'preview';
  static CONTENT_TYPE = 'image/jpeg';
}

/**
 * Helper to initialize outbox and various operations...
 * @private
 */
export default function(networkStatus: NetworkStatus): Outbox {
  let outbox = getOutboxInstance();

  // The outbox has special queues specific to blob uploads so we don't clog
  // up the main queue with video/previews (which are running constantly).
  const videoOptions = {
    // TODO: This should be computed somehow, and dynamically adjusted
    concurrency: 8,
    diskConcurrency: 4,
  };
  const previewOptions = {
    // TODO: This should be computed somehow, and dynamically adjusted
    concurrency: 5,
    diskConcurrency: 3,
  };

  outbox.registerQueue('event_video', videoOptions);
  outbox.registerQueue('video', videoOptions, 'event_video');
  outbox.registerQueue('event_preview', previewOptions);
  outbox.registerQueue('preview', previewOptions, 'event_preview');

  // Register all known operations so we can create them from disk as needed...
  outbox.registerOperation(CrashReporterOperation);
  outbox.registerOperation(PapertrailOperation);
  outbox.registerOperation(VideoUploadOperation);
  outbox.registerOperation(PreviewUploadOperation);
  outbox.registerOperation(APICallOperation);

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
