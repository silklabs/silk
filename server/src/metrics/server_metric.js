/**
 * Base class for all server metrics.
 *
 * @flow
 */

import version from 'silk-core-version';
import {Metric} from 'silk-api';

type Props = {
  // Version of the device.
  version: string;
  branch: string;
}

export default class ServerMetric extends Metric {
  static INDEX = new Set([
    'version',
    'branch',
  ]);

  properties: Props;
  constructor(props: {[key: string]: any}) {
    super(Object.assign({
      version: version.semver,
      branch: version.branch,
    }, props));
  }
}
