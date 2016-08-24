/**
 * Copyright (c) 2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @flow
 */

import {Metric, MetricTypes} from 'silk-api';

export class ZipDownload extends Metric {
  static NAME = 'updater_zip_download';
  static DESC = 'Measures time it took to download an update .zip';

  constructor(downloadTimeMS: number, zipSize: number) {
    super({
      downloadTimeMS: new MetricTypes.Integer(Math.floor(downloadTimeMS)),
      zipSize: new MetricTypes.Integer(zipSize),
    });
  }
}

export type UpdateType = 'none' | 'full' | 'inc';

export class UpdateCheck extends Metric {
  static NAME = 'update_check';
  static DESC = 'Records when a device checks for a new OTA';

  constructor(selectedUpdate: UpdateType) {
    super({
      updateType: selectedUpdate,
    });
  }
}

