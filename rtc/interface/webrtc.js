/**
 * Interface for the collection of webrtc interfaces.
 *
 * @flow
 */

export type UserMediaConstraints = {
  // The constraints are platform specific and fairly complex so they are typed
  // simply as "Object".
  audio: bool | Object;
  video: bool | Object;
};

// Taken from https://w3c.github.io/webrtc-pc/#widl-RTCDataChannelInit
export type RTCDataChannelInit = {
  ordered?: bool;
  maxPacketLifeTime?: number;
  maxRetransmits?: number;
  negotiated?: bool;
  ordered?: bool;
  protocol?: bool;
};

// https://www.w3.org/TR/webmessaging/#the-messageevent-interfaces
export type RTCIceCandidate = {
  candidate?: string;
  sdpMid?: string;
  sdpMLineIndex?: number;
};

declare export class RTCPeerConnectionIceEvent extends Event {
  candidate?: string;
  url?: string;
}

declare export class RTCDataChannelEvent extends Event {
  channel: RTCDataChannel;
}

declare export class RTCStreamEvent extends Event {
  stream: MediaStream;
}

// Flow throws all kinds of property `handleEvent`. Property not found in ...
// When extending EventTarget directly and I am too lazy to figure out why.
declare class WebrtcEventTarget {
  addEventListener(
    name: string,
    handler: (event: any) => mixed,
  ): void;

  removeEventListener(name: string, handler?: Function): void;
}

type RTCSignalingState =
  'stable' |
  'have-local-offer' |
  'have-remote-offer' |
  'have-local-pranswer' |
  'have-remote-pranswer' |
  'closed';

type RTCIceGatheringState =
  'new' |
  'gathering' |
  'complete';

type RTCIceConnectionState =
  'new' |
  'checking' |
  'connected' |
  'completed' |
  'failed' |
  'disconnected' |
  'closed';

type RTCPeerConnectionState =
  'new' |
  'connecting' |
  'connected' |
  'disconnected' |
  'failed';

declare export class RTCPeerConnection extends WebrtcEventTarget {
  signalingState: RTCSignalingState;
  iceGatheringState: RTCIceGatheringState;
  iceConnectionState: RTCIceConnectionState;
  connectionState: RTCPeerConnectionState;

  close(): void;
  createDataChannel(
    name: string,
    config: RTCDataChannelInit
  ): RTCDataChannel;

  addIceCandidate(candidate: RTCIceCandidate): void;
  addStream(stream: MediaStream): void;
  removeStream(stream: MediaStream): void;
}

declare export class RTCSessionDescription {
  constructor(sdp: string): RTCSessionDescription;
}

declare export class RTCDataChannel extends WebrtcEventTarget {
  label: string;
  readyState: string;
  close: () => void;
  binaryType: string;
  send: (data: string | Buffer | ArrayBuffer) => void;
}

// strictly speaking this is not a real "interface" but we expect it to handle
// node/vs browser differences...
export interface WebRTC {
  RTCIceCandidate: RTCIceCandidate;
  RTCPeerConnection: typeof RTCPeerConnection;
  RTCSessionDescription: typeof RTCSessionDescription;
}
