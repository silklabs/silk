/**
 * Copyright (c) 2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @private
 * @flow
 */

import createLog from 'silk-log/device';
import invariant from 'assert';
import fs from 'mz/fs';
import mkdirp from 'mkdirp-promise';
import msgpack from 'msgpack-lite';

import wrapNoEntity from '../fs/wrap_no_entity';

// All the types that we can currently serialize to disk using msgpack.
type SerializableType =
  SerializableObject |
  Array<SerializableType> |
  Set<SerializableType> |
  Map<string, SerializableType> |
  Buffer |
  Date |
  RegExp |
  Error |
  Int8Array |
  Uint8Array |
  Int16Array |
  Uint16Array |
  Int32Array |
  Uint32Array |
  Float32Array |
  Float64Array |
  Uint8ClampedArray |
  ArrayBuffer |
  DataView |
  string |
  number |
  boolean |
  null |
  void;

export type SerializableObject = {[key: string]: SerializableType};

type ChainableFunction = (() => Promise<?SerializableObject | void>);

// Codes for custom message pack hooks.
const MSGPACK_SET_CODE = 0x2e;
const MSGPACK_MAP_CODE = 0x2f;

const log = createLog(`redux-storage`);

export const MSGPACK_CODEC = msgpack.createCodec({preset: true});
MSGPACK_CODEC.addExtPacker(
  MSGPACK_SET_CODE,
  Set,
  (set) => msgpack.encode(Array.from(set.values()), {codec: MSGPACK_CODEC})
);
MSGPACK_CODEC.addExtUnpacker(
  MSGPACK_SET_CODE,
  (data) => new Set(msgpack.decode(data, {codec: MSGPACK_CODEC}))
);
MSGPACK_CODEC.addExtPacker(
  MSGPACK_MAP_CODE,
  Map,
  (map) => msgpack.encode(Array.from(map.entries()), {codec: MSGPACK_CODEC})
);
MSGPACK_CODEC.addExtUnpacker(
  MSGPACK_MAP_CODE,
  (data) => new Map(msgpack.decode(data, {codec: MSGPACK_CODEC}))
);

let savePromise: Promise<void> = Promise.resolve();

function chain(func: ChainableFunction): Promise<any> {
  const promise = savePromise.then(func);

  // Attach a dummy promise on the end to clear the promise chain on error.
  savePromise =
    promise.catch((error) => {
      process.nextTick(() => {
        throw error;
      });
    })
    .then(() => undefined);

  return promise;
}

async function realSave(data: Buffer, path: string): Promise<void> {
  const tmpPath = `${path}.tmp`;

  if (await wrapNoEntity(fs.unlink(tmpPath)) !== null) {
    log.debug(`Removed '${tmpPath}'`);
  }

  log.debug(`Writing data to ${tmpPath}`);
  await fs.writeFile(tmpPath, data);

  log.debug(`Moving '${tmpPath}' to '${path}'`);
  await fs.rename(tmpPath, path);

  log.debug(`Finished writing`);
}

async function realLoad(path: string): Promise<?SerializableObject> {
  log.debug(`Attempting to read '${path}'`);

  let encodedData: ?Buffer = null;
  try {
    encodedData = await fs.readFile(path);
  } catch (error) {
    if (error.code !== `ENOENT`) {
      throw error;
    }
    log.debug(`'${path}' does not exist`);
    return null;
  }

  invariant(encodedData);

  log.debug(`Decoding '${path}'`);
  return decode(encodedData);
}

export function encode(state: SerializableObject): Buffer {
  return msgpack.encode(state, {codec: MSGPACK_CODEC});
}

export function decode(data: Buffer): SerializableObject {
  return msgpack.decode(data, {codec: MSGPACK_CODEC});
}

export function save(state: SerializableObject, path: string): Promise<void> {
  log.debug(`Queueing save to '${path}'`, state);

  const encodedData = encode(state);
  invariant(encodedData);

  return chain(() => realSave(encodedData, path));
}

export function load(path: string): Promise<?SerializableObject> {
  log.debug(`Queueing load from '${path}'`);

  return chain(() => realLoad(path));
}

export async function ensureDirectory(path: string): Promise<boolean> {
  const stats = await wrapNoEntity(fs.stat(path));
  if (stats) {
    invariant(stats.isDirectory());
    return false;
  }

  log.debug(`Creating '${path}'`);
  await mkdirp(path);

  return true;
}
