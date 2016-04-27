/**
 * @providesModule noble
 * @flow
 */

import { EventEmitter } from 'events';

type ConnectCallback = (error: any) => void;
type RssiCallback = (error: any, rssi?: number) => void;
type UuidsCallback = (error: any, uuids?: Array<string>) => void;
type ReadCallback = (error: any, data?: Buffer) => void;
type WriteCallback = (error: any) => void;
type DescriptorsCallback = (error: any, descriptors?: Array<Descriptor>) => void;
type ServicesCallback = (error: any, services?: Array<Service>) => void;
type CharacteristicsCallback = (error: any, characteristics?: Array<Characteristic>) => void;
type ServicesAndCharacteristicsCallback = (
  error: any,
  services?: Array<Service>,
  characteristics?: Array<Characteristic>
) => void;

type Advertisement = {
  localName: string;
  txPowerLevel: number;
  serviceUuids: Array<string>;
  manufacturerData: ?Buffer;
  serviceData: ?Buffer;
}

declare export class Descriptor extends EventEmitter {
  uuid: string;
  name: ?string;
  type: ?string;

  readValue(callback: ReadCallback): void;
  writeValue(data: Buffer, callback: ?WriteCallback): void;
}

declare export class Service extends EventEmitter {
  uuid: string;
  name: ?string;
  type: ?string;
  includedServiceUuids: Array<string>;
  characteristics: Array<Characteristic>;

  discoverIncludedServices(
    serviceUuids: Array<string>,
    callback: ?UuidsCallback
  ): void;
  discoverCharacteristics(
    characteristicUuids: Array<string>,
    callback: ?CharacteristicsCallback
  ): void;
}

declare export class Characteristic extends EventEmitter {
  uuid: string;
  name: ?string;
  type: ?string;
  properties: Array<string>;
  descriptors: Array<Descriptor>;

  read(callback: ?ReadCallback): void;
  write(
    data: Buffer,
    withoutResponse: boolean,
    callback: ?WriteCallback
  ): void;
  broadcast(broadcast: boolean, callback: ?WriteCallback): void;
  notify(notify: boolean, callback: ?WriteCallback): void;
  discoverDescriptors(callback: ?DescriptorsCallback): void;
}

declare export class Peripheral extends EventEmitter {
  id: string;
  uuid: string;
  address: string;
  addressType: 'random' | 'public';
  connectable: boolean;
  advertisement: Advertisement;
  rssi: number;
  services: Array<Service>;
  state: string;

  connect(callback?: ConnectCallback): void;
  disconnect(callback?: ConnectCallback): void;
  updateRssi(callback?: RssiCallback): void;
  discoverServices(
    serviceUuids: Array<string>,
    callback?: ServicesCallback
  ): void;
  discoverSomeServicesAndCharacteristics(
    serviceUuids: Array<string>,
    characteristicsUuids: Array<string>,
    callback?: ServicesAndCharacteristicsCallback
  ): void;
  discoverAllServicesAndCharacteristics(
    serviceUuids: Array<string>,
    characteristicsUuids: Array<string>,
    callback?: ServicesAndCharacteristicsCallback
  ): void;
}

declare export class Noble extends EventEmitter {
  state: string;

  startScanning(
    serviceUuids: Array<string>,
    allowDuplicates: boolean,
    callback?: ConnectCallback
  ): void;
  stopScanning(callback?: ConnectCallback): void;
}

declare var noble: Noble;
declare export default typeof noble;
