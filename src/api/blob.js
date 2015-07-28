import fetch from 'node-fetch';
import { Readable } from 'stream';
import throwError from './fetch_error';

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
  let baseUrl = config.server_url;  //eslint-disable-line
  return {
    async signedUrl() {
      let endpoint = `${baseUrl}/blob`;
      let response = await fetch(endpoint, { method: 'POST' });
      if (!response.ok) {
        await throwError(response);
      }
      return response.json();
    },

    async ack(url) {
      let endpoint = `${baseUrl}/blob/ack`;
      let response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ url })
      });
      if (!response.ok) {
        await throwError(response);
      }
      return response.json();
    },

    async upload(putUrl, size, bufferOrStream) {
      let stream;
      if (bufferOrStream instanceof Buffer) {
        bufferOrStream = new BufferToStream(bufferOrStream);
      }
      stream = bufferOrStream;
      let response = await fetch(putUrl, {
        method: 'put',
        body: stream,
        headers: {
          'Content-Length': size
        }
      });

      if (!response.ok) {
        await throwError(response);
      }
    },

    async uploadAndAck(size, bufferOrStream) {
      let { putUrl } = await this.signedUrl();
      await this.upload(putUrl, size, bufferOrStream);
      return await this.ack(putUrl);
    }
  };
}
