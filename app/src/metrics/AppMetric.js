/**
 * Base class for all app metrics.
 *
 * @flow
 */

import { NativeModules } from 'react-native';
import version from 'silk-core-version';
import {Metric} from 'silk-api';

let { SLKUtil } = NativeModules;

type Props = {
  // Version of the device.
  version: string;
  iosSystemName: string;
  iosModel: string;
  iosSystemVersion: string;
}

export default class AppMetric extends Metric {
  static INDEX = new Set([
    'version',
    'iosSystemName',
    'iosSystemVersion',
    'iosModel',
  ]);

  properties: Props;
  constructor(props: {[key: string]: any}) {
    super(Object.assign({
      version: version.semver,
      iosSystemName: SLKUtil.systemName,
      iosSystemVersion: SLKUtil.systemVersion,
      iosModel: SLKUtil.model,
    }, props));
  }
}
