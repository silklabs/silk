/**
 * @flow
 */

import {Metric, Integer} from 'silk-api';

type Props = {
  // Type of device.
  type: string;
  // Version of the device.
  version: string;
  // How long it takes to load js deps.
  startupMS: Integer;

}

export default class JSStartup extends Metric {

  static NAME = 'js_startup';
  static DESC = `
    Measures time between when core.js is loaded and when we begin running main.js
  `;
  static INDEX = new Set(['type', 'version']);

  properties: Props;
  constructor(props: Props) {
    super(props);
  }
}
