import fetch from './fetch';
import { Readable } from 'stream';
import throwError from './fetch_error';
import fetchJson from './fetch_json';
import url from 'url';

class BufferToStream extends Readable {
  constructor(buffer) {
    super();
    this.buffer = buffer;
  }

  _read() {
    this.push(this.buffer);
    // next time _read is called this will be returned triggering the end of
    // the stream...
    this.buffer = null;
  }
}


export default function(config) {
  let baseUrl = config.serverUrl;
  return {
    signedUrl: fetchJson.bind(null, url.resolve(baseUrl, 'blob')),
    ack: fetchJson.bind(null, url.resolve(baseUrl, 'blob/ack')),

    async upload(putUrl, size, bufferOrStream, contentType) {
      let stream;
      if (bufferOrStream instanceof Buffer) {
        bufferOrStream = new BufferToStream(bufferOrStream);
      }
      stream = bufferOrStream;
      let request = {
        method: 'put',
        body: stream,
        headers: {
          'Content-Length': size
        }
      };

      if (contentType) {
        request.headers['content-type'] = contentType;
      }

      let response = await fetch(putUrl, request);

      if (!response.ok) {
        await throwError(response);
      }
    },

    async uploadAndAck(size, bufferOrStream, contentType) {
      let { putUrl } = await this.signedUrl({
        contentType
      });
      await this.upload(putUrl, size, bufferOrStream, contentType);
      return await this.ack({ url: putUrl });
    }
  };
}
