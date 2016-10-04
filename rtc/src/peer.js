/**
 * @flow
 */

/* globals MediaStream */

import invariant from 'assert';
import EventEmitter from 'events';
import eventToPromise from 'event-to-promise';
import {Lock} from 'silk-async-utils';
import createLog from 'silk-log';

import {webrtcPromise, ICE_ERROR} from './utils';
import * as WebRTC from './webrtc';
import StructuredDataChannel from './structured_data_channel';
import Manager from './signaling/manager';

import type {
  RTCPeerConnection,
  RTCDataChannelInit,
  RTCDataChannelEvent,
  RTCStreamEvent,
  UserMediaConstraints,
} from './webrtc';

import type TransportEmitter from './transport_emitter';

type DataChannelState = {
  channel: ?StructuredDataChannel;
};

type MediaRequestEvent = {
  label: string;
  constraints: UserMediaConstraints;
};

type MediaResponseEvent = {
  label: string;
  error: ?string;
  success: boolean;
};

type MediaRemoveStreamEvent = {
  label: string;
};

type OngoingMediaState = {
  created: Date;
  label: string;
  stream: ?MediaStream;
  local: boolean;
};

type MediaRequestHandler = (
  label: string,
  constraints: UserMediaConstraints,
) => Promise<MediaStream>;

const IGNORED_DATA_CHANNELS = new Set([
  Manager.SIGNALING_DATA_CHANNEL,
]);
const log = createLog('rtc:peer');

export default class Peer extends EventEmitter {

  _peerConnection: RTCPeerConnection;
  _dataChannels: Map<string, DataChannelState> = new Map();

  _manager: Manager;

  /**
   * Control transport emitter used to communicate with the peer to avoid various
   * races, etc... In the webrtc handshake process...
   */
  _control: ?TransportEmitter;

  /**
   * Holds the pending promise for the initial signaling ...
   */
  _pendingSignaling: ?Promise<void>;

  /**
   * Has this peer ever been connected ?
   */
  _hasConnected: boolean = false;

  /**
   * Media stream metadata
   */
  _mediaStreams: Map<string, OngoingMediaState> = new Map();
  _mediaRequestHandler: ?MediaRequestHandler;
  _mediaStreamRequestQueue: Array<MediaRequestEvent> = [];
  _mediaStreamRequestRunning: boolean = false;
  _requestRemoteMediaStreamLock: Lock<MediaStream> = new Lock();

  async _processMediaRequestQueue(): Promise<void> {
    // The control stream is always present here ...
    const control = this._control;
    invariant(control);

    const request = this._mediaStreamRequestQueue.shift();
    if (!request) {
      return;
    }

    try {
      if (!this._mediaRequestHandler) {
        const response: MediaResponseEvent = {
          label: request.label,
          error: `Peer not currently handling media requests`,
          success: false,
        };
        control.emit('mediaResponse', response);
        return;
      }
      log.info(`Handling media request for ${request.label}`);
      invariant(this._mediaRequestHandler);
      const stream = await this._mediaRequestHandler(
        request.label,
        request.constraints,
      );
      this._addStream(request.label, stream);
      const response: MediaResponseEvent = {
        error: '',
        label: request.label,
        success: true,
      };
      control.emit('mediaResponse', response);
      log.info(`Successfully added media with label: ${response.label}`);
    } catch (err) {
      log.error(`Failed to handle media request: ${err.stack}`);
      const response: MediaResponseEvent = {
        label: request.label,
        error: err.stack,
        success: false,
      };
      control.emit('mediaResponse', response);
      return;
    }
  }

  async _runMediaRequestQueue(): Promise<void> {
    if (this._mediaStreamRequestRunning) {
      return;
    }

    this._mediaStreamRequestRunning = true;
    try {
      await this._processMediaRequestQueue();
    } catch (err) {
      log.info(`Unexpected error occured while processing media request`, err.stack);
    } finally {
      this._mediaStreamRequestRunning = false;
    }
  }

  _onMediaRequest(media: MediaRequestEvent) {
    this._mediaStreamRequestQueue.push(media);
    this._runMediaRequestQueue();
  }

  _onMediaRemoveStream(event: MediaRemoveStreamEvent) {
    this.removeStream(event.label);
  }

  _observeControl(control: TransportEmitter): void {
    control.on('mediaRequest', this._onMediaRequest);
    control.on('mediaRemoveStream', this._onMediaRemoveStream);
  }

  _onIceConnectionState() {
    const state = this._peerConnection.iceConnectionState;

    if (ICE_ERROR.has(state)) {
      const pc = this._peerConnection;
      log.info('marking peer as closed', {
        signalingState: pc.signalingState,
        iceConnectionState: pc.iceConnectionState,
        iceGatheringState: pc.iceGatheringState,
      });
      // Ensure that we are not listening to anything else important ...
      this.destroy();
      this.emit('close', { reason: state });
    }
  }

  _onDataChannel(event: RTCDataChannelEvent) {
    const { channel } = event;

    // Some data channels may have special functions outside of the norm.
    if (IGNORED_DATA_CHANNELS.has(channel.label)) {
      return;
    }

    const structuredChannel = new StructuredDataChannel(channel);
    log.info(`ondatachannel: ${channel.label}`);
    this._dataChannels.set(channel.label, {
      channel: structuredChannel,
    });
    this.emit('datachannel', structuredChannel);
  }

  _onRemoveStream(event: RTCStreamEvent) {
    const state = Array.from(this._mediaStreams.values()).find((state) => {
      return state.stream && state.stream.id === event.stream.id;
    });

    if (!state) {
      log.warn(`Removed stream which we had no record of : ${event.stream.id}`);
      return;
    }

    const { label } = state;
    this._mediaStreams.delete(label);
    this.emit('removestream', { label, stream: event.stream });
  }

  // Pre-bind event listeners.
  _onMediaRequest: ((media: MediaRequestEvent) => void) = this._onMediaRequest.bind(this);
  _onMediaRemoveStream: ((event: MediaRemoveStreamEvent) => void) = this._onMediaRemoveStream.bind(this);
  _onIceConnectionState: (() => void) = this._onIceConnectionState.bind(this);
  _onDataChannel: ((event: RTCDataChannelEvent) => void) = this._onDataChannel.bind(this);
  _onRemoveStream: ((event: RTCStreamEvent) => void) = this._onRemoveStream.bind(this);

  constructor(
    pc: RTCPeerConnection,
    manager: Manager,
    mediaRequestHandler: ?MediaRequestHandler,
  ) {
    super();

    this._peerConnection = pc;
    this._manager = manager;
    if (mediaRequestHandler) {
      this._mediaRequestHandler = mediaRequestHandler;
    }

    pc.addEventListener('iceconnectionstatechange', this._onIceConnectionState);
    pc.addEventListener('datachannel', this._onDataChannel);
    pc.addEventListener('removestream', this._onRemoveStream);
  }

  setMediaRequestHandler(handler: ?MediaRequestHandler) {
    this._mediaRequestHandler = handler;
  }

  /**
   * Request a local media stream from the current peer.
   */
  requestLocalMediaStream(constraints: UserMediaConstraints): Promise<MediaStream> {
    return webrtcPromise(WebRTC, 'getUserMedia', constraints);
  }

  requestRemoteMediaStream(label: string, constraints: UserMediaConstraints) {
    return this._requestRemoteMediaStreamLock.run(() => {
      return this._requestRemoteMediaStream(label, constraints);
    });
  }

  async _requestRemoteMediaStream(
    label: string,
    constraints: UserMediaConstraints
  ): Promise<MediaStream> {
    if (this._mediaStreams.has(label)) {
      throw new Error(`Stream '${label}' already in progress`);
    }

    let initialState = {
      created: new Date(),
      label,
      local: false,
      stream: null,
    };

    this._mediaStreams.set(label, initialState);

    await this.connect();
    const control = this._control;
    invariant(control);

    const request: MediaRequestEvent = {
      label,
      constraints,
    };

    log.info(`Requesting remote media stream: ${label}`, constraints);

    // The request/response flow ensures that request/response are never
    // interleaved so it is safe to simply wait for the mediaResponse event.
    control.emit('mediaRequest', request);
    const pendingAddStream = eventToPromise(this._peerConnection, 'addstream');
    const response = await eventToPromise(control, 'mediaResponse');
    if (response.error) {
      // Cancel waiting for the stream as we got an error.
      pendingAddStream.cancel();
      throw new Error(response.error);
    }
    const { stream } = await pendingAddStream;
    this._mediaStreams.set(label, Object.assign({}, initialState, { stream }));
    this.emit('addstream', { label, stream });
    log.info(`Successfully got remote media stream: ${label}`);
    return stream;
  }

  _addStream(label: string, stream: MediaStream) {
    for (let [currentLabel, currentState] of this._mediaStreams.entries()) {
      if (currentLabel === label) {
        throw new Error(`Cannot re-register stream with label=${label}`);
      }

      if (currentState.stream && currentState.stream.id === stream.id) {
        throw new Error(`Cannot re-register stream with label=${label} id=${stream.id}`);
      }
    }

    const state = { label, stream, local: true, created: new Date() };
    this._peerConnection.addStream(stream);
    this._mediaStreams.set(label, state);
  }

  /**
   * XXX: Consider making this return a promise so we can be sure that remote has
   *      removed the other side of the stream.
   */
  removeStream(label: string): boolean {
    const state = this.getMediaStream(label);
    if (!state) {
      log.info(`Cannot remove stream with label: ${label} ( not found )`);
      return false;
    }
    const { stream, local } = state;
    invariant(stream);

    if (local) {
      // Due to how chromium webrtc handles stream removal we only get removal
      // events if both the stream _and_ all tracks have been removed.
      for (let track of stream.getTracks()) {
        stream.removeTrack(track);
      }
      log.info(`Removed stream with label: ${label}`);
      this._peerConnection.removeStream(stream);
      // We remove the record of this stream here as the caller of removeStream
      // will not get a removestream event.
      this._mediaStreams.delete(label);
    } else {
      const event: MediaRemoveStreamEvent = {
        label,
      };
      // Control should always be available by now ...
      invariant(this._control);
      this._control.emit('mediaRemoveStream', event);
      log.info(`Notifed peer to remove stream with label: ${label}`);
      // NOTE: We intentionally leave it up to removestream handler to remove the
      // state entry in mediaStreams.
    }

    return true;
  }

  getMediaStream(label: string): ?OngoingMediaState {
    return this._mediaStreams.get(label);
  }

  getMediaStreams(): Map<string, OngoingMediaState> {
    // Shallow clone of the map ...
    return new Map(this._mediaStreams);
  }

  destroy() {
    this._mediaStreams.forEach((state, label) => {
      if (state.local) {
        this.removeStream(label);
      }
    });
    this._manager.destroy();
  }

  getChannel(label: string): ?StructuredDataChannel {
    let state = this._dataChannels.get(label);
    if (!state) {
      return null;
    }
    return state.channel;
  }

  /**
   * Wrapper for creating a data channel then waiting for it's creation.
   *
   * This is idempotent and safe to call more than once.
   *
   * NOTE: The current convention is that only one side of the peer creates a
   * channel with a given name. If both sides are attempting to create a single
   * channel with the same name will result in _two_ independent data channels.
   */
  createChannel(
    label: string,
    config: RTCDataChannelInit = {}
  ): StructuredDataChannel {
    let state = this._dataChannels.get(label);
    if (!state) {
      state = {};
    }

    if (state.channel) {
      log.info(`Create channel (already exists): ${label}`);
      invariant(state.channel);
      return state.channel;
    }

    log.info(`Create channel (creating...): ${label}`);
    const channel = this._peerConnection.createDataChannel(label, config);
    const structuredChannel = new StructuredDataChannel(channel);

    this._dataChannels.set(label, {
      channel: structuredChannel,
    });

    structuredChannel.on('close', () => {
      log.info(`Removing closed channel: ${label}`);
      this._dataChannels.delete(label);
    });
    return structuredChannel;
  }

  connect(): Promise<void> {
    if (this._hasConnected) {
      return Promise.resolve();
    }

    if (this._pendingSignaling) {
      return this._pendingSignaling;
    }

    this._pendingSignaling =
      this._manager.signal(this._peerConnection).then((control) => {
        this._control = control;
        this._observeControl(control);
        this._hasConnected = true;
        this.emit('connect');
      }).catch((err) => {
        this._pendingSignaling = null;
        throw err;
      });

    return this._pendingSignaling;
  }

}
