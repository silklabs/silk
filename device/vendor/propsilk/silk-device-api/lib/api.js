/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @private
 * @flow
 */

import createApi from 'silk-api';
import {getstrprop} from 'silk-sysutils';
import version from 'silk-core-version';

export default createApi({
  metrics: {
    type: `device`,
    tags: {
      version: version.semver,
      deviceType: getstrprop('ro.silk.build.board') + '-' +
                  getstrprop('ro.silk.build.product'),
    },
  },
});
