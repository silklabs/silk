/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */
/**
 * Copyright (c) 2015 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

import assert from 'assert';
import { BTLE_SOCKET_UUIDS } from 'silk-api';
import { Duplex } from 'stream';
import makeLog from '../log';

const log = makeLog(`btle-stream`);

// This is the amount of time we will wait after issuing a write request without
// acknowledgement before returning an error to the caller. It's pretty
// arbitrary.
const WRITE_TIMEOUT_MS = 15000;

// The maximum number of bytes we will write at a time. This is mostly governed
// by the 1024 byte maximum command size that we can send to bledroid using the
// Android FrameworkListener socket stuff. Those commands have to include
// characteristic uuids and other metadata so the amount of space left for the
// actual data is smaller than 512.
const WRITE_MAX_BYTES = 256;

class Stream extends Duplex {
  _isServer = false;

  _subscribed = false;
  _wasSubscribed = false;

  _writeError = null;

  _btMaxChunkSize = 0;
  _btDrained = true;
  _btWriteCallback = null;
  _btWriteTimeout = null;

  _pushDataWhenAvailable = false;
  _streamWriteCallback = null;

  _eventEmitter = null;
  _dataEmitter = null;

  _incomingBuffer = null;
  _outgoingBuffer = null;

  _ended = false;
  _finished = false;

  constructor(serviceOrPeripheral, isServer) {
    log.debug(`Stream(${isServer})`);

    super();

    this._isServer = isServer;

    this.once(`end`, () => {
      assert(!this._ended);
      this._ended = true;

      if (this._finished) {
        this.emit(`close`);
      }
    });

    this.once(`finish`, () => {
      assert(!this._finished);
      this._finished = true;

      if (this._ended) {
        this.emit(`close`);
      }
    });

    if (isServer) {
      this._initServer(serviceOrPeripheral);
    } else {
      this._initClient(serviceOrPeripheral);
    }
  }

  _initServer(serivce) {
    log.debug(`Stream._initServer()`);

    serivce.addListener(`subscribe`, this._onSubscribe);
    serivce.addListener(`unsubscribe`, this._onUnsubscribe);
    serivce.addListener(`drain`, this._onDrain);
    // No easy way to have a `disconnect` listener.
    this._eventEmitter = serivce;

    serivce.addListener(`data`, this._onData);
    this._dataEmitter = serivce;
  }

  _initClient(peripheral) {
    log.debug(`Stream._initClient()`);

    assert(peripheral.state === `connected`);

    let socketService;
    for (let service of peripheral.services) {
      if (service.uuid === BTLE_SOCKET_UUIDS.service) {
        socketService = service;
        break;
      }
    }

    assert(socketService);

    let socketCharacteristic;
    for (let characteristic of socketService.characteristics) {
      if (characteristic.uuid === BTLE_SOCKET_UUIDS.characteristic) {
        socketCharacteristic = characteristic;
        break;
      }
    }

    assert(socketCharacteristic);

    const handleNotifyError = () => {
      const error = new Error(`Failed to enable notifications`);
      // Don't let any writes succeed.
      this._setWriteError(error);

      // Notify the consumer of the error.
      this._emitError(error);

      // Close the read stream.
      this.push(null);
    };

    let timeout = null;

    const eventName = `notify`;
    const notifyListener = state => {
      log.debug(`Notifications %sabled`, state ? `en` : `dis`);
      if (timeout) {
        clearTimeout(timeout);
        timeout = null;
      }
      socketCharacteristic.removeListener(eventName, notifyListener);

      if (!state) {
        handleNotifyError();
        return;
      }

      peripheral.addListener(`disconnect`, this._onDisconnect);
      this._eventEmitter = peripheral;

      socketCharacteristic.addListener(`data`, this._onData);
      this._dataEmitter = socketCharacteristic;

      const writeCallback = data => {
        socketCharacteristic.write(data,
                                   /* withoutResponse */ false,
                                   this._onDrain);
      };
      this._onSubscribe(writeCallback, WRITE_MAX_BYTES);
    };

    timeout = setTimeout(() => {
      log.debug(`Timed out while setting up notification`);
      socketCharacteristic.removeListener(eventName, notifyListener);
      handleNotifyError();
    }, WRITE_TIMEOUT_MS);

    socketCharacteristic.addListener(eventName, notifyListener);
    socketCharacteristic.notify(true);
  }

  _emitError(error) {
    try {
      // If there are no error listeners attached then this will throw...
      this.emit(`error`, error);
    } catch(e) {
      log.warn(e);
    }
  }

  // Part of the stream API.
  _read(size) {
    log.debug(`Stream._read(%d)`, size);

    assert(!this._pushDataWhenAvailable);

    this._pushData(size);
  }

  // Part of the stream API.
  _write(data, encoding, callback) {
    log.debug(`Stream._write(<Buffer ${data.length}>, ${encoding})`);
    assert(encoding === `buffer`);
    assert(!this._streamWriteCallback);

    if (this._writeError) {
      log.debug(`Passing previous write error to write callback`);
      assert(!this._outgoingBuffer);
      callback(this._writeError);
      return;
    }

    // We must have never been subscribed or we must be subscribed now.
    assert(!this._wasSubscribed || this._subscribed);

    if (this._outgoingBuffer) {
      // TODO: Not very efficient.
      this._outgoingBuffer = Buffer.concat([ this._outgoingBuffer, data ]);
    } else {
      this._outgoingBuffer = data;
    }
    this._streamWriteCallback = callback;

    this._maybeWrite();
  }

  _onSubscribe = (writeCallback, maxChunkSize) => {
    log.debug(`Stream._onSubscribe(${maxChunkSize})`);

    assert(!this._subscribed);
    assert(!this._wasSubscribed);
    assert(!this._btWriteCallback);
    assert(!this._btMaxChunkSize);

    this._subscribed = true;
    this._wasSubscribed = true;
    this._btWriteCallback = writeCallback;
    this._btMaxChunkSize = maxChunkSize;

    if (this._isServer) {
      this._eventEmitter.removeListener(`subscribe`, this._onSubscribe);
    }

    this._maybeWrite();
  };

  _onUnsubscribe = () => {
    log.debug(`Stream._onUnsubscribe()`);

    assert(this._subscribed);
    assert(this._wasSubscribed);

    this._subscribed = false;
    this._btWriteCallback = null;

    clearTimeout(this._btWriteTimeout);
    this._btWriteTimeout = null;

    if (this._isServer) {
      this._eventEmitter.removeListener(`unsubscribe`, this._onUnsubscribe);
      this._eventEmitter.removeListener(`drain`, this._onDrain);
    } else {
      this._eventEmitter.removeListener(`disconnect`, this._onDisconnect);
    }
    this._dataEmitter.removeListener(`data`, this._onData);

    // There's no way we can send more data now so clear any buffered data.
    this._outgoingBuffer = null;

    // Make sure any further write() calls fail.
    let error = new Error(`Other side has disconnected, cannot write`);
    this._setWriteError(error);

    if (!this._finished) {
      error = new Error(`Other side disconnected unexpectedly`);
      this._emitError(error);
    }

    if (this._pushDataWhenAvailable) {
      assert(!this._incomingBuffer);
      this._pushDataWhenAvailable = false;
      this._pushData();
    }
  };

  _onDisconnect = () => {
    log.debug(`Stream._onDisconnect()`);

    assert(!this._isServer);

    if (this._subscribed) {
      this._onUnsubscribe();
    }
  };

  _onData = data => {
    log.debug(`Stream._onData(<Buffer ${data.length}>)`);

    if (this._incomingBuffer) {
      // TODO: Not very efficient.
      this._incomingBuffer = Buffer.concat([ this._incomingBuffer, data ]);
    } else {
      this._incomingBuffer = data;
    }

    if (this._pushDataWhenAvailable) {
      this._pushDataWhenAvailable = false;
      this._pushData();
    }
  };

  _onDrain = () => {
    log.debug(`Stream._onDrain()`);

    assert(!this._btDrained);

    if (this._btWriteTimeout) {
      assert(this._streamWriteCallback);
      clearTimeout(this._btWriteTimeout);
      this._btWriteTimeout = null;
    }

    this._btDrained = true;

    if (!this._streamWriteCallback) {
      return;
    }

    if (this._outgoingBuffer.length > this._btMaxChunkSize) {
      this._outgoingBuffer = this._outgoingBuffer.slice(this._btMaxChunkSize);
      this._maybeWrite();
    } else {
      this._outgoingBuffer = null;

      let callback = this._streamWriteCallback;
      this._streamWriteCallback = null;

      callback(this._writeError);
    }
  };

  _setWriteError(error) {
    log.debug(`Stream._setWriteError('${error.toString()}')`);

    assert(!this._writeError);

    // Make all future writes fail.
    this._writeError = error;

    // Don't hang on to data that we will never send.
    this._outgoingBuffer = null;

    // Unblock the write stream. It's still the consumer's responsibility to
    // call |end()\.
    const callback = this._streamWriteCallback;
    this._streamWriteCallback = null;

    this._btDrained = true;
    if (callback) {
      callback(error);
    }
  }

  _maybeWrite() {
    log.debug(`Stream._maybeWrite()`);

    if (!this._outgoingBuffer ||
        !this._btDrained ||
        !this._btWriteCallback ||
        !this._streamWriteCallback) {
      return;
    }

    let chunk;
    if (this._outgoingBuffer.length > this._btMaxChunkSize) {
      chunk = this._outgoingBuffer.slice(0, this._btMaxChunkSize);
    } else {
      chunk = this._outgoingBuffer;
    }

    this._btWriteCallback(chunk);
    this._btDrained = false;

    this._btWriteTimeout = setTimeout(() => {
      this._btWriteTimeout = null;

      const callback = this._streamWriteCallback;
      this._streamWriteCallback = null;

      const error = new Error(`Timed out while writing`);
      callback(error);
    }, WRITE_TIMEOUT_MS);
  }

  _pushData(size = /* node's default read chunk size 16k */ 16 * 1024) {
    log.debug(`Stream._pushData(${size})`);

    assert(!this._pushDataWhenAvailable);

    if (!this._incomingBuffer) {
      if (!this._subscribed && this._wasSubscribed) {
        // We're unsubscribed so no more data is coming. End the stream.
        log.debug(`Disconnected and all data consumed`);
        this.push(null);
        return;
      }

      log.debug(`All data consumed, waiting for more`);
      this._pushDataWhenAvailable = true;
      return;
    }

    while (this._incomingBuffer) {
      let chunk;
      if (size >= this._incomingBuffer.length) {
        chunk = this._incomingBuffer;
        this._incomingBuffer = null;
      } else {
        chunk = this._incomingBuffer.slice(0, size);
        this._incomingBuffer = this._incomingBuffer.slice(size);
      }

      if (!this.push(chunk)) {
        log.debug(`Read stream full, waiting to push more data`);
        break;
      }
    }
  }
}

export class ServerStream extends Stream {
  constructor(service) {
    log.debug(`ServerStream()`);

    super(service, true);
  }
}

export class ClientStream extends Stream {
  constructor(peripheral) {
    log.debug(`ClientStream()`);

    super(peripheral, false);
  }
}
