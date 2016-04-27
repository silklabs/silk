/**
 * @providesModule bleno
 * @flow
 */

import { EventEmitter } from 'events';

declare export class Bleno extends EventEmitter {
  platform: string;
  state: string;
  address: string;
  rssi: number;
  mtu: number;

  stopAdvertising(callback?: Function): void;
  startAdvertising(
    name: string,
    serviceUuids: Array<string>,
    callback?: Function
  ): void;
  startAdvertisingIBeacon(
    uuid: string,
    major: number,
    minor: number,
    measuredPower: number,
    callback?: Function
  ): void;
}

declare var bleno: Bleno;
declare export default typeof bleno;
