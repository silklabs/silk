/**
 * Glue to let native Android code call into Javascript.
 *
 * @flow
 */

/* eslint-env browser */

import EventEmitter from 'events';
import createLog from 'silk-log';

const log = createLog('AndroidJSHelper');

export type NativeJSInterface = {
  resolveBlobURI(uri: string): string;
};

declare var silkNativeHelper: NativeJSInterface;

function base64StringToArrayBuffer(base64String: string): ArrayBuffer {
  let binaryString = atob(base64String);
  let arrayBuffer = new ArrayBuffer(binaryString.length);
  let byteArray = new Uint8Array(arrayBuffer);
  for (let i = 0; i < binaryString.length; i++) {
    byteArray[i] = binaryString.charCodeAt(i);
  }
  return arrayBuffer;
}

export default class AndroidJSHelper extends EventEmitter {

  enqueueSegment(uri: string) {
    let segmentData = base64StringToArrayBuffer(silkNativeHelper.resolveBlobURI(uri));
    log.debug(`Resolved segment blob ${uri} to ${segmentData.byteLength} bytes`);
    this.emit('segment', segmentData);
  }

  play() {
    log.debug('play()');
    this.emit('play');
  }

  pause() {
    log.debug('pause()');
    this.emit('pause');
  }

}
