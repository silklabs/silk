import invariant from 'assert';
import { Transform, Duplex } from 'stream';

import createLog from 'silk-log';

const log = createLog('stream:demuxplex');

const STREAM_MESSAGE = 0;
const STREAM_CLOSE = 1;

const MAX_HEADER_SIZE = 60;
const MIN_HEADER_SIZE = 2;

type StreamMeta = {
  id: string;
  stream: Duplex;
  remoteClosed: bool;
  localFinished: bool;
};

/**
 * Designed for use on device with signaling server. Messages typically come
 * from a websocket which emits frames:
 *
 * Header:
 *
 *   1 byte (message type) : 0 = message, 1 = close
 *   N byte(s) (id)
 *
 * Body:
 *
 *   N (bytes) [opaque data for a further stream to process].
 *
 */
export default class DemuxStream extends Transform {

  _current: ?StreamMeta;
  _streams: Map<string, StreamMeta> = new Map();
  _writeDest: Duplex;

  constructor(source: Duplex) {
    super({
      readableObjectMode: true,
    });
    this._writeDest = source;

    source.on('error', this._onSourceError);
  }

  _onSourceError: (err: Error) => void = (err: Error) => {
    for (let id of this._streams.keys()) {
      this._closeStream(id, err);
    }
  };

  /**
   * Generally test only method to ensure that streams get cleaned up on error
   * or end/close.
   */
  hasStream(id: string): bool {
    return this._streams.has(id);
  }

  _closeStream(id: string, err: ?Error) {
    const meta = this._streams.get(id);
    this._streams.delete(id);

    // Ensure that we do not emit close twice..
    if (!meta) {
      return;
    }

    log.info('close stream', id);
    const { stream } = meta;
    stream.push(null);
    if (err) {
      stream.emit('error', err);
    }
    stream.emit('close');
  }

  _registerStream(id: string) {
    log.info('creating stream', id);

    const stream = new Duplex({
      read: () => {
      }, // no-op we push directly into this stream.
      write: (chunk: Buffer, encoding: string, callback: Function) => {
        log.verbose('write from substream', id);
        this._writeDest.write(id);
        this._writeDest.write(chunk, encoding, callback);
      },
    });

    let meta = {
      id,
      stream,
      localFinished: false,
      remoteClosed: false,
    };

    this._streams.set(id, meta);

    stream.on('finish', () => {
      log.info(`Stream ${id} has finished`);
      meta.localFinished = true;
      if (meta.remoteClosed) {
        this._closeStream(id);
      }
    });

    log.info(`Pushing new stream: ${id}`);
    this.push(stream);
  }

  _transform(chunk: Buffer, encoding: string, callback: Function) {
    if (!this._current) {
      if (chunk.length > MAX_HEADER_SIZE && chunk.length > MIN_HEADER_SIZE) {
        const msg = `Got header of invalid size: ${chunk.length}`;
        log.error(msg);
        callback(new Error(msg));
        return;
      }

      const [type, streamId] = JSON.parse(chunk);

      if (type === STREAM_CLOSE) {
        log.info('close stream header', streamId);
        const streamMeta = this._streams.get(streamId);
        if (!streamMeta) {
          callback(
            new Error(`Attempting to close non-existant stream: ${streamId}`)
          );
          return;
        }
        // readable side of this stream is done.
        streamMeta.remoteClosed = true;
        streamMeta.stream.push(null);

        if (streamMeta.localFinished) {
          this._closeStream(streamId);
        } else {
          this._closeStream(
            streamId,
            new Error(`Connection has closed before stream has finished.`)
          );
        }

        callback();
        return;
      }

      if (type !== STREAM_MESSAGE) {
        callback(new Error(`Unknown message type: ${type}`));
        return;
      }

      // XXX: This might not be the best option (hex).
      if (!this._streams.has(streamId)) {
        this._registerStream(streamId);
      }
      this._current = this._streams.get(streamId);

      callback();
      return;
    }

    invariant(this._current);
    const current = this._current;
    this._current = null;

    log.verbose(`Push to substream: ${current.id} ${chunk.length}`);
    current.stream.push(chunk);
    callback();
  }
}
