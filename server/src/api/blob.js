import fetch from './fetch';
import fetchJson from './fetch_json';
import { Readable } from 'stream';
import throwError from './fetch_error';
import { resolve } from 'url';

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

async function getPutUrl(baseUrl, blobType, contentLength, contentType) {
  const postUrl = resolve(baseUrl, `blob/${blobType.toLowerCase()}`);
  const body = {
    contentLength,
    contentType: contentType.toLowerCase(),
  };
  let { putUrl } = await fetchJson(postUrl, body);
  return putUrl;
}

async function put(putUrl, contentLength, contentType, bufferOrStream, timeoutMs = 0) {
  let stream;
  if (bufferOrStream instanceof Buffer) {
    stream = new BufferToStream(bufferOrStream);
  } else {
    stream = bufferOrStream;
  }

  const request = {
    method: 'PUT',
    headers: {
      'Content-Length': contentLength,
      'Content-Type': contentType.toLowerCase()
    },
    body: stream,
    timeout: timeoutMs
  };

  const response = await fetch(putUrl, request);
  if (!response.ok) {
    await throwError(response);
  }
}

async function ack(postUrl, putUrl) {
  const { url } = await fetchJson(postUrl, { url: putUrl });
  return url;
}

export default function(config) {
  const baseUrl = config.serverUrl;
  return {
    getPutUrl: getPutUrl.bind(null, baseUrl),
    put,
    ack: ack.bind(null, resolve(baseUrl, 'blob/ack')),

    async upload(blobType, contentLength, contentType, bufferOrStream, timeoutMs = 0) {
      let putUrl = await this.getPutUrl(blobType, contentLength, contentType);
      await this.put(putUrl, contentLength, contentType, bufferOrStream, timeoutMs);
      return await this.ack(putUrl);
    }
  };
}
