/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @private
 */

import createApi from 'silk-api';
import {getprop} from 'silk-sysutils';
import version from 'silk-core-version';

export default createApi({
  metrics: {
    type: `device`,
    tags: {
      version: version.semver,
      deviceType: getprop('ro.product.device'),
    },
  }
});
