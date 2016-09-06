// All the various native stuff we need ...

import EventEmitter from 'events';

import * as native from './native';
import Blob from './blob';

// Re-export the things that do not need extra wrapping ...
export {
  getUserMedia,
  RTCSessionDescription,
  RTCGarbageCollect,
  RTCSessionDescription,
  RTCIceCandidate,
  setDebug
} from './native';

function assignGetters(constructor, list) {
  list.forEach((propertyName) => {
    Object.defineProperty(constructor.prototype, propertyName, {
      enumerable: true,
      get: function () {
        return this.$target[propertyName];
      },
    });
  });
}

function assignMethods(constructor, list) {
  list.forEach((methodName) => {
    constructor.prototype[methodName] = function(...args) {
      return this.$target[methodName](...args);
    };
  });
}

function dispatchEvent(target, name, ...data) {
  const onName = `on${name}`;
  target.emit(name, ...data);
  if (typeof target[onName] === 'function') {
    target[onName](...data)
  }
}

const DataChannelEvents = [
  'open',
  'message',
  'close',
  'error',
];

const RTCPeerConnectionEvents = [
  'signalingstatechange',
  'iceconnectionstatechange',
  'icecandidate',
  'datachannel',
  'negotiationneeded',
  'addstream',
  'removestream',
];

const DataChannelGetters = [
  'id',
  'label',
  'ordered',
  'protocol',
  'readyState',
  'bufferedAmount',
  'maxPacketLifeType',
  'maxRetransmits',
  'negotiated',
  'reliable',
];

const RTCPeerConnectionGetters = [
  // Simple getters:
  'signalingState',
  'iceConnectionState',
  'iceGatheringState',
  'localDescription',
  'remoteDescription',
];

const RTCPeerConnectionMethods = [
  'createOffer',
  'createAnswer',
  'setLocalDescription',
  'setRemoteDescription',
  'addIceCandidate',
  'addStream',
  'removeStream',
  'getLocalStreams',
  'getStreamById',
  'getStats',
  'close',
];

const DataChannelMethods = [
  'close',
  'send',
];

const DataChannelEventHandlers = {
  message(event) {
    if (this.binaryType === 'blob' && event.data instanceof ArrayBuffer) {
      event.data = new Blob([event.data]);
    }
    dispatchEvent(this, 'message', event);
  },
};

const RTCPeerConnectionEventHandlers = {
  datachannel(event) {
    event.channel = new DataChannel(event.channel);
    dispatchEvent(this, 'datachannel', event);
  },
};

// Lazy and poor attempt at making event emitter respond to the bare minimum api
// surface to get this working with a browser implementation.
class EventTarget extends EventEmitter {
  addEventListener(...data) {
    return this.addListener(...data);
  }

  removeEventListener(...data) {
    return this.removeListener(...data);
  }
}

class DataChannel extends EventTarget {
  // $target contains the underlying data channel.
  $target = null;

  constructor(target) {
    super();
    this.$target = target;
    DataChannelEvents.forEach((eventName) => {
      let method = DataChannelEventHandlers[eventName];
      if (!method) {
        method = (...data) => dispatchEvent(this, eventName, ...data);
      }
      this.$target[`on${eventName}`] = method.bind(this);
    });
  }

  get binaryType() {
    return this._binaryType || this.$target.binaryType;
  }

  set binaryType(value) {
    this._binaryType = value;
  }
}
assignGetters(DataChannel, DataChannelGetters);
assignMethods(DataChannel, DataChannelMethods);


// We need to wrap the RTCPeerConnection interface to provide a proper event
// target.
export class RTCPeerConnection extends EventTarget {
  // $target contains the underlying native peer connection.
  $target = null;

  constructor(config = {}, constraints = {}) {
    super();
    this.$target = native.RTCPeerConnection(config, constraints);

    RTCPeerConnectionEvents.forEach((eventName) => {
      let method = RTCPeerConnectionEventHandlers[eventName];
      if (!method) {
        method = (...data) => dispatchEvent(this, eventName, ...data);
      }
      this.$target[`on${eventName}`] = method.bind(this);
    });
  }

  createDataChannel(...args) {
    return new DataChannel(this.$target.createDataChannel(...args));
  }
}

assignGetters(RTCPeerConnection, RTCPeerConnectionGetters);
assignMethods(RTCPeerConnection, RTCPeerConnectionMethods);
