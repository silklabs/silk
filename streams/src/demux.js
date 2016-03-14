import invariant from 'assert';
import { Transform, Duplex } from 'stream';

import createLog from 'silk-log';

const log = createLog('stream:demuxplex');

const STREAM_MESSAGE = 0;
const STREAM_CLOSE = 1;

type StreamMeta = {
  stream: Duplex;
  remoteClosed: false;
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
export class DemuxStream extends Transform {

  _currentId: string;
  _streams: Map<string, StreamMeta> = new Map();
  _source: Duplex;

  constructor(source: Duplex) {
    super({
      writableObjectMode: false,
      readableObjectMode: true,
    });
    this._source = source;
  }

  /**
   * Generally test only method to ensure that streams get cleaned up on error
   * or end/close.
   */
  hasStream(id: string): bool {
    return this._streams.has(id);
  }

  _closeStream(id: string) {
    log.info('close stream', id);

    const meta = this._streams.get(id);
    invariant(meta);
    const { stream } = meta;
    stream.emit('close');
    this._streams.delete(id);
  }

  _registerStream(id: string, header: Buffer) {
    log.verbose('creating stream', id);

    const stream = new Duplex({
      read: () => {
      }, // no-op we push directly into this stream.
      write: (chunk: Buffer, encoding: string, callback: Function) => {
        log.verbose('write from substream', id);
        this._source.write(header);
        this._source.write(chunk, encoding, callback);
      }
    });

    let meta = {
      stream,
      localFinished: false,
      remoteClosed: false,
    };

    this._streams.set(id, meta);

    stream.on('finish', () => {
      meta.localFinished = true;
      if (meta.remoteClosed) {
        this._closeStream(id);
      }
    });

    this.push(stream);
  }

  _transform(chunk: Buffer, encoding: string, callback: Function) {
    if (!this._currentId) {
      const type = chunk.readUInt8(0);
      const streamIdBinary = chunk.slice(1);
      const streamId = streamIdBinary.toString('hex');

      if (type === STREAM_CLOSE) {
        log.info('close stream header', streamId);
        const streamMeta = this._streams.get(streamId);
        if (!streamMeta) {
          callback(
            new Error(`Attempting to close non-existant stream: ${this.streamId.toString('hex')}`)
          );
          return;
        }
        // readable side of this stream is done.
        streamMeta.remoteClosed = true;
        streamMeta.stream.push(null);

        if (streamMeta.localFinished) {
          this._closeStream(streamId);
        }

        return;
      }

      if (type !== STREAM_MESSAGE) {
        callback(new Error(`Unknown message type: ${type}`));
        return;
      }

      // XXX: This might not be the best option (hex).
      this._currentId = streamId;
      if (!this._streams.has(this._currentId)) {
        this._registerStream(this._currentId, streamIdBinary);
      }

      callback();
      return;
    }

    const meta = this._streams.get(this._currentId);
    invariant(meta);

    log.verbose(`Push to substream: ${this._currentId} ${chunk.length}`);
    this._currentId = null;
    meta.stream.push(chunk);
    callback();
  }
}

export default function (source: Duplex) {
  // Constructors should not mutate (pipe is a mutation). So we export a top
  // level function instead.
  const demux = new DemuxStream(source);
  source.pipe(demux);

  return demux;
}
