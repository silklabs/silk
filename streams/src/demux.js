/**
 * This module implements a stream based multiplex (both mux and demux).
 *
 * While this module does not depend on WebSockets it does assume the underlying
 * transport is using a message based transport. Generally this means when you
 * .write the other end will see that same data read (without partial resuts).
 * In other words using a TCP based stream would fail horribly.
 *
 *
 * Message format:
 *
 * Under the hood this module sends individual messages to represent a stream.
 *
 * Messages always start with a header and may have a body depending on type.
 *
 * header: | type (one byte) | id (16 bytes [uuid]) |
 * body: <bytes>
 *
 * @flow
 */
import invariant from 'assert';
import { Transform, Duplex } from 'stream';
import uuid from 'uuid';

import createLog from 'silk-log';

const log = createLog('stream:demuxplex');

const HEADER_LENGTH = 17;

const STREAM_CREATE = 0;
const STREAM_MESSAGE = 1;
const STREAM_READ_END = 2;
const STREAM_WRITE_END = 3;
// Remote side of stream triggers close ...
const STREAM_DESTROY = 4;

// should match above constants!
type CreateStreamBody = {[key: string]: mixed};
type Header = [number, string];
type TransformCb = (error: ?Error, data?: Buffer | string) => void;
type VirtualStreamType = 'local' | 'remote';
type VirtualStreamState = {
  localFinish: bool;
  localEnd: bool;
  remoteFinish: bool;
  remoteEnd: bool;
};

function buildHeader(type: number, id: string): Buffer {
  const buffer = Buffer.from([
    type,
    ...uuid.parse(id),
  ]);
  invariant(buffer.length === HEADER_LENGTH);
  return buffer;
}

/**
 * Represents a single stream inside of the multiplexed stream.
 */
export class VirtualStream extends Duplex {
  _id: string;
  _writeDest: Duplex;
  _name: string;
  _body: CreateStreamBody;
  _type: VirtualStreamType;
  _closed: bool = false;
  _error: bool = false;

  _virtualState: VirtualStreamState = {
    localFinish: false,
    localEnd: false,
    remoteFinish: false,
    remoteEnd: false,
  };

  get type(): VirtualStreamType {
    return this._type;
  }

  get body(): CreateStreamBody {
    return this._body;
  }

  get name(): string {
    return this._name;
  }

  set name(name: string) {
    this._name = `${name} ${this.type} (id: ${this._id})`;
  }

  _onFinish: () => void = () => {
    this._updateVirtualState({ localFinish: true });
    log.verbose(`finished writing to ${this.name}`);
    this._writeDest.write(buildHeader(STREAM_WRITE_END, this._id));
  };

  _onEnd: () => void = () => {
    this._updateVirtualState({ localEnd: true });
    log.verbose(`finished reading from ${this.name}`);
    this._writeDest.write(buildHeader(STREAM_READ_END, this._id));
  };

  _updateVirtualState(update: {
    localEnd?: bool;
    remoteEnd?: bool;
    localFinish?: bool;
    localEnd?: bool;
  }) {
    Object.assign(this._virtualState, update);
    const state = this._virtualState;

    // TODO Reconcile state here ....
    if (
      state.localEnd && state.localFinish &&
      state.remoteEnd && state.remoteFinish
    ) {
      this._ensureClosed();
    }
  }

  static createLocal(
    id: string,
    body: CreateStreamBody,
    writeTo: Duplex,
    name: ?string,
  ): VirtualStream {
    return new VirtualStream(id, body, writeTo, 'local', name);
  }

  static createRemote(
    id: string,
    body: CreateStreamBody,
    writeTo: Duplex,
  ): VirtualStream {
    return new VirtualStream(id, body, writeTo, 'remote', null);
  }

  constructor(
    id: string,
    body: CreateStreamBody,
    writeTo: Duplex,
    type: VirtualStreamType,
    name: ?string,
  ) {
    super({
      // Do not coerce into buffer.
      decodeStrings: false,
      // Let data flow through this without buffering.
      objectMode: true,
    });
    this._id = id;
    this._writeDest = writeTo;
    this._body = body;
    this._type = type;

    if (name) {
      this.name = name;
    } else {
      this._name = `id:${this._id} ${this._type}`;
    }

    this.on('end', this._onEnd);
    this.on('finish', this._onFinish);
  }

  _ensureClosed() {
    if (!this._closed) {
      this._closed = true;
      this.emit('close');
    }
  }

  _cleanListeners() {
    this.removeListener('end', this._onEnd);
    this.removeListener('finish', this._onFinish);
  }

  _cleanStreamState() {
    const state = this._virtualState;
    if (!state.localFinish) {
      // There is no point in allowing further writes as nobody will see them.
      this.end();
    }

    // If we never saw the other side finish writing we have not yet emitted
    // the end event.
    if (!state.remoteFinish) {
      // ensure readable side of duplex is complete.
      this.push(null);
    }

    this._ensureClosed();
  }

  notifyError(err: Error) {
    log.verbose(`${this.name} notifyErr`, err);
    if (this._error) {
      return;
    }
    this._error = true;
    this._cleanListeners();
    this.emit(
      'error',
      new Error(`Underlying stream has closed: ${err.message}`),
    );
    this._cleanStreamState();
  }

  // To be called only by this module internally ...
  notifyRemoteReadEnd() {
    this._updateVirtualState({ remoteEnd: true });
  }

  notifyRemoteWriteEnd() {
    this.push(null);
    this._updateVirtualState({ remoteFinish: true });
  }

  _read() {
    // pushing data happens elsewhere ...
  }

  _write(
    chunk: Buffer | string,
    encoding: string,
    callback: (error: ?Error, data?: Buffer | string) => void
  ): bool {
    log.verbose(`${this.name} write ${chunk.length} bytes`);
    this._writeDest.write(buildHeader(STREAM_MESSAGE, this._id));
    this._writeDest.write(chunk, encoding, callback);
    return true;
  }

  /**
   * Destroy this stream and notify the other end that we are no longer listening.
   *
   * Useful for cases where you want to close the other end of the stream without
   * closing the underling multiplexed stream.
   */
  destroy() {
    if (this._error || this._virtualState.localFinish) {
      return;
    }

    this._cleanListeners();
    this._writeDest.write(buildHeader(STREAM_DESTROY, this._id));
    this._cleanStreamState();
  }
}

/**
 * Designed for use on device with signaling server. Messages typically come
 * from a websocket which emits frames:
 *
 * Header: [id, {}] // metadata tells which frame and what kind of message.
 *
 * Body:
 *
 *   N (bytes) [opaque data for a further stream to process].
 *
 */
export default class DemuxStream extends Transform {

  _streams: Map<string, VirtualStream> = new Map();
  _writeDest: Duplex;
  _headerAwaitingData: ?Header;
  // for logging only ...
  name: string = '';

  constructor(source: Duplex, name?: string) {
    super({
      decodeStrings: false,
      readableObjectMode: true,
    });
    this._writeDest = source;

    source.pipe(this);
    source.on('error', this._onSourceError);

    if (name) {
      this.name = `(DemuxStream: ${name}) `;
    }
  }

  _onSourceError: (err: Error) => void = (err: Error) => {
    this.removeListener('error', this._onSourceError);
    this._writeDest.unpipe(this);

    for (let stream of this._streams.values()) {
      stream.notifyError(err);
    }
    this._streams.clear();

    this.emit('error', err);
  };

  /**
   * Number of currently active streams.
   */
  streamCount(): number {
    return this._streams.size;
  }

  /**
   * Generally test only method to ensure that streams get cleaned up on error
   * or end/close.
   */
  hasStream(id: string): bool {
    return this._streams.has(id);
  }

  createStream(body: CreateStreamBody = {}, name?: string): VirtualStream {
    const id = uuid.v4();
    const stream = VirtualStream.createLocal(id, body, this._writeDest, name);
    // notify the remote side that we are creating a stream ...
    this._writeDest.write(buildHeader(STREAM_CREATE, id));
    // write the body for this new stream type.
    this._writeDest.write(JSON.stringify(body));
    log.verbose(`${this.name}${stream.name} create stream`);
    this._registerStream(id, stream);
    return stream;
  }

  _registerStream(id: string, stream: VirtualStream) {
    this._streams.set(id, stream);

    let cleanupStream = () => {
      log.info(`Cleaning up stream: ${stream.name}`);
      this._streams.delete(id);
      stream.removeListener('close', cleanupStream);
      stream.removeListener('error', cleanupStream);
    };
    stream.on('close', cleanupStream);
    stream.on('error', cleanupStream);
  }

  _processHeader(chunk: Buffer, callback: TransformCb) {
    if (chunk.length !== HEADER_LENGTH) {
      callback(new Error(`Invalid header length`));
      return;
    }

    const type = chunk[0];
    let id;
    try {
      id = uuid.unparse(chunk, 1);
    } catch (err) {
      callback(new Error(`Failed to parse uuid in header`));
      return;
    }
    invariant(id);

    log.verbose(`${this.name}handle header`, type, id);
    switch (type) {
    case STREAM_CREATE:
    case STREAM_MESSAGE:
      this._headerAwaitingData = [type, id];
      callback();
      break;
    case STREAM_READ_END:
      this._handleStreamReadEnd(id, callback);
      break;
    case STREAM_WRITE_END:
      this._handleStreamWriteEnd(id, callback);
      break;
    case STREAM_DESTROY:
      this._handleStreamDestroy(id, callback);
      break;
    default:
      callback(new Error(`Invalid header type given ...`));
      return;
    }
  }

  _handleStreamWriteEnd(id: string, callback: TransformCb) {
    const stream = this._streams.get(id);
    if (!stream) {
      callback(new Error(`write end for unknown stream`));
      return;
    }
    // signal the end of the readable side of the stream..
    log.verbose(`${this.name}${stream.name} remote done writing ...`);
    stream.notifyRemoteWriteEnd();
    callback();
  }

  _handleStreamReadEnd(id: string, callback: TransformCb) {
    const stream = this._streams.get(id);
    if (!stream) {
      callback(new Error(`read end for unknown stream`));
      return;
    }
    stream.notifyRemoteReadEnd();
    callback();
  }

  _handleStreamDestroy(id: string, callback: TransformCb) {
    const stream = this._streams.get(id);
    if (!stream) {
      callback(new Error(`destroy for unknown stream`));
      return;
    }
    stream.notifyError(new Error(`Remote stream no longer listening.`));
    callback();
  }

  _handleCreateStream(id: string, chunk: string, callback: TransformCb) {
    // NOTE: While I chose json here for ease this could easily be binary or some
    // other single message config data...
    let json;
    try {
      json = JSON.parse(chunk);
    } catch (err) {
      callback(new Error(`Invalid create stream body: ${err}`));
      return;
    }

    if (this.hasStream(id)) {
      callback(new Error(`UUID collision on create stream: ${id}`));
      return;
    }

    invariant(json);
    invariant(typeof json === 'object');
    const stream = VirtualStream.createRemote(id, json, this._writeDest);
    this._registerStream(id, stream);
    // $FlowFixMe: Cannot correctly type duplex.
    this.push(stream);
    callback(null);
  }

  _handleStreamMessage(
    id: string,
    chunk: Buffer | string,
    callback: TransformCb,
  ) {
    const stream = this._streams.get(id);
    if (!stream) {
      callback(new Error(`Message for unknown stream: ${id}`));
      return;
    }
    log.verbose(`${this.name}${stream.name} got ${chunk.length} bytes`);
    stream.push(chunk);
    callback();
  }

  _transform(
    chunk: Buffer | string,
    encoding: string,
    callback: TransformCb,
  ) {
    if (!this._headerAwaitingData) {
      if (!(chunk instanceof Buffer)) {
        callback(new Error(`Invalid header: must be a buffer`));
        return;
      }
      this._processHeader(chunk, callback);
      return;
    }

    const header = this._headerAwaitingData;
    this._headerAwaitingData = null;
    invariant(header);
    const [headerType, id] = header;

    switch (headerType) {
    case STREAM_CREATE:
      log.verbose(`${this.name}got create body ${id} ${chunk.length}`);
      this._handleCreateStream(id, chunk.toString(), callback);
      break;
    case STREAM_MESSAGE:
      log.verbose(`${this.name}got message body ${id} ${chunk.length}`);
      this._handleStreamMessage(id, chunk, callback);
      break;
    default:
      // This should never happen unless _processHeader has a bug.
      throw new Error(`Should be unreachable ...`);
    }
  }
}
