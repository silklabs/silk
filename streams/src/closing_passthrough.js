/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @flow
 */

import ClosingTransform from './closing_transform';

export default class ClosingPassThrough extends ClosingTransform {

  _transform(
    chunk: Buffer | string,
    encoding: string,
    callback: (error: ?Error, data?: Buffer | string) => void
  ) {
    callback(null, chunk);
  }

}
