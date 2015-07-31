import uuid from 'uuid';
import path from 'path';
import fs from 'mz/fs';
import eventToPromise from 'event-to-promise';
import url from 'url';

function waitForPipe(writer) {
  return Promise.race([
    eventToPromise(writer, 'error').then(err => {
      throw err;
    }),
    eventToPromise(writer, 'finish')
  ]);
}

class FileBlobs {
  constructor(config, storagePath) {
    this.config = config;
    this.path = storagePath;
  }

  async sign(key) {
    key = key || uuid.v4();
    return url.resolve(this.config.server.publicUrl, `blob/${key}`);
  }

  async write(headers, key, reader) {
    let metaPath = path.join(this.path, `${key}.json`);
    await fs.writeFile(metaPath, JSON.stringify(headers));

    let writer = fs.createWriteStream(path.join(
      this.path,
      key
    ));
    reader.pipe(writer);
    await waitForPipe(writer);
  }

  /**
  @param String key to read.
  @param {Stream} response express response object.
  */
  async respond(key, response) {
    let metaPath = path.join(this.path, `${key}.json`);
    let headers = JSON.parse(await fs.readFile(metaPath, 'utf8'));

    if ('content-type' in headers) {
      response.set('Content-Type', headers['content-type']);
    }

    if ('content-length' in headers) {
      response.set('Content-Length', headers['content-length']);
    }

    response.status(200);
    let reader = fs.createReadStream(path.join(
      this.path,
      key
    ));
    reader.pipe(response);
    await waitForPipe(response);
  }
}

export default async function(config) {
  let path = config.blobs.file.path;

  if (!await fs.exists(path)) {
    await fs.mkdir(path);
  }

  return new FileBlobs(
    config,
    path
  );
}
