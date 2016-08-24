/**
 * Copyright (c) 2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @flow
 */

import {Metric} from 'silk-api';

export class KeywordDetected extends Metric {
  static NAME = 'dialog_keyword';
  static DESC = 'Records when the dialog keyword was detected';

  constructor() {
    super({buttonPress: false});
  }
}

export class KeywordButtonPress extends Metric {
  static NAME = 'dialog_keyword';
  static DESC = 'Records when the dialog action button was detected';

  constructor() {
    super({buttonPress: true});
  }
}

