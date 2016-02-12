/**
 * Interface for the collection of webrtc interfaces.
 *
 * @flow
 */

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


// Flow throws all kinds of property `handleEvent`. Property not found in ...
// When extending EventTarget directly and I am too lazy to figure out why.
declare class WebrtcEventTarget {
  addEventListener(
    name: string,
    handler: (event: any) => mixed,
  ): void;

  removeEventListener(name: string, handler?: Function): void;
}

declare export class RTCPeerConnection extends WebrtcEventTarget {
  iceGatheringState: 'new' | 'gathering' | 'complete';

  iceConnectionState: 'new' |
                      'checking' |
                      'connected' |
                      'completed' |
                      'failed' |
                      'disconnected' |
                      'closed';

  signalingState: 'stable' |
                  'have-local-offer' |
                  'have-remote-offer' |
                  'have-local-pranswer' |
                  'have-remote-panswer' |
                  'closed';
  close(): void;
  createDataChannel(
    name: string,
    config: RTCDataChannelInit
  ): RTCDataChannel;

  addIceCandidate(candidate: RTCIceCandidate): void;
}

declare export class RTCSessionDescription {
  constructor(sdp: string): RTCSessionDescription;
}

declare export class RTCDataChannel extends WebrtcEventTarget {
  readyState: string;
  close: () => void;
  send: (data: string | Buffer | ArrayBuffer) => void;
}

// strictly speaking this is not a real "interface" but we expect it to handle
// node/vs browser differences...
export interface WebRTC {
  RTCIceCandidate: RTCIceCandidate;
  RTCPeerConnection: typeof RTCPeerConnection;
  RTCSessionDescription: typeof RTCSessionDescription;
}
