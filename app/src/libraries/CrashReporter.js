/**
 * Raygun-based crash reporter for React Native Javascript
 *
 * Copyright (c) 2015 Silk Labs, Inc
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

import version from 'silk-core-version';
import RaygunApi from 'silk-raygun/api';
import { parse } from 'stacktrace-parser';
import { exitApp } from './Util';

class CrashReporter {

  static start() {
    if (!version.official) {
      console.log('CrashReporter disabled in non-official builds');
      return;
    }

    // Save the old RN error handler
    const oldHandler = ErrorUtils._globalHandler;
    ErrorUtils.setGlobalHandler((err, isFatal) => {
      try {
        const stackTrace = parse(err.stack);

        const message = {
          occurredOn: new Date(),
          details: {
            version: version.semver,
            error: {
              stackTrace: stackTrace.map(site => {
                return {
                   column: site.column,
                   fileName: site.file,
                   lineNumber: site.lineNumber,
                   methodName: site.methodName,
                };
              }),
              message: err.message,
              className: err.name,
            },
            tags: [ 'app' ],
            userCustomData: {
              isFatal,
            },
          },
        };

        RaygunApi.create(message)
        .then(() => {
          // JS crash report posted. Exit as the app state is unstable
          exitApp();
        })
        .catch(err2 => {
          // Failed to send the JS error to raygun, maybe we're offline.  Force
          // a native crash to pass the JS error along to the Raygun2iOS
          // provide, which supports an outbox, so that we'll hopefully see this
          // error transmitted in the future.
          oldHandler(err, isFatal);
        });
      } catch (err2) {
        console.log('Error while processing error:', err2, err2.stack);
        oldHandler(err, isFatal);
      }
    });
  }
}
export default CrashReporter;
