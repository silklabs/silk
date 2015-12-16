/**
 * Copyright (c) 2015 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

import ClosingTransform from './closing_transform';

export default class ClosingPassThrough extends ClosingTransform {

  _transform(chunk, encoding, callback) {
    callback(null, chunk);
  }

}
