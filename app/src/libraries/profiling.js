import { ec as ECDH } from 'elliptic';
import { Systrace } from 'react-native';

import { CryptoSign, RssiSmoother } from 'silk-api';
import HttpClient from 'silk-http/src/client';
import * as StreamsModule from 'silk-streams';

import BLEStream from './ble/Stream';
import { Socket, SocketManager } from './ble/SocketManager';
import { DeviceManager } from './ble/DeviceManager';

import AsyncComponent from '../components/abstract/AsyncComponent';

function instrumentEventEmitterEmit(EventEmitterClass) {
  const emit = EventEmitterClass.prototype.emit;
  EventEmitterClass.prototype.emit = function(name) {
    Systrace.beginEvent(`${EventEmitterClass.name}.emit('${name}')`);
    emit.apply(this, arguments);
    Systrace.endEvent();
  };
}

if (__DEV__) {
  Systrace.measureMethods(
    HttpClient.prototype,
    'silk-http.HttpClient',
    ['request']
  );

  Systrace.measureMethods(
    CryptoSign,
    'silk-api.CryptoSign',
    [
      'generateKeyPair',
      'publicKeyFromSecret',
      'sign',
      'verify',
      'sha256',
      'sha256hex',
    ]
  );

  Systrace.measureMethods(
    RssiSmoother.prototype,
    'silk-api.RssiSmoother',
    ['_histogram', '_computeValue']
  );

  Systrace.measureMethods(
    ECDH.prototype,
    'elliptic.ec',
    ['genKeyPair', 'keyFromPublic']
  );

  Systrace.measureMethods(
    require('jsonwebtoken'),
    'jsonwebtoken',
    ['sign']
  );

  const streamMethods = [
    'end',
    'push',
    'write',
    '_read',
    '_write',
    '_flush',
    '_transform',
  ];
  const streamClasses = [
    'AuthenticateReadStream',
    'AuthenticateWriteStream',
    'AuthenticateDuplexStream',
    'EncryptStream',
    'DecryptStream',
    'CryptoDuplexStream',
    'HeartbeatReceiverStream',
    'HeartbeatSenderStream',
    'HeartbeatDuplexStream',
    'MessagePackDecodeStream',
    'MessagePackEncodeStream',
    'MessagePackDuplexStream',
  ];
  streamClasses.forEach((streamClassName) => {
    const streamClass = StreamsModule[streamClassName];
    const prototype = streamClass.prototype;
    instrumentEventEmitterEmit(streamClass);
    Systrace.measureMethods(
      prototype,
      'silk-streams.' + streamClassName,
      streamMethods.filter((methodName) => !!prototype[methodName]),
    );
  });

  Systrace.measureMethods(
    StreamsModule.EncryptStream.prototype,
    'silk-streams.EncryptStream',
    [
      '_onRandomBytes',
      '_encodeInteger',
      '_processChunk',
      '_processBufferedChunks',
      'setKeyPair',
    ]
  );

  Systrace.measureMethods(
    StreamsModule.DecryptStream.prototype,
    'silk-streams.DecryptStream',
    [
      '_deriveKey',
      '_decodeEncryptedChunkSize',
      '_createDecipher',
      '_pushEncryptedData',
      '_pushNextMessage',
      '_processChunk',
      'setKeyPair',
    ]
  );

  Systrace.measureMethods(
    BLEStream.prototype,
    'ble.Stream',
    streamMethods.filter((methodName) => !!BLEStream.prototype[methodName])
  );

  [
    BLEStream,
    Socket,
    SocketManager,
    DeviceManager,
  ].forEach(instrumentEventEmitterEmit);

  Systrace.measureMethods(
    AsyncComponent.prototype,
    'AsyncComponent',
    ['setState', 'setStateAsync']
  );
}
