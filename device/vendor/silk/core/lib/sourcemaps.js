/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @flow
 */

import {install as installSourceMapSupport} from 'source-map-support';
import * as util from 'silk-sysutils';
import createLog from 'silk-log/device';
const log = createLog('sourcemaps');

export function install() {
  installSourceMapSupport();

  const prepareStackTrace = Error.prepareStackTrace;
  Error.prepareStackTrace = (error, stack) => {
    const startMs = util.uptime();
    const trace = prepareStackTrace(error, stack);
    const prepareMs = util.uptime(startMs);
    if (prepareMs > 200) {
      log.warn(`Slow prepareStackTrace() took ${prepareMs} milliseconds`);
    }
    return trace;
  };

  if (util.getboolprop('persist.silk.dev.warmsourcemaps', false)) {
    // Force the source maps into memory right away. It typically takes ~5
    // seconds to load the source maps and unfortunately asynchronous loading is
    // not currently supported by the source map library.  Taking the hit now
    // avoids an unpredictable delay the first time an exception is thrown.
    log.verbose('Warming up source maps');
    (new Error()).stack; // Trigger a call to Error.prepareStackTrace
    log.verbose('Source maps ready');
  }
}
