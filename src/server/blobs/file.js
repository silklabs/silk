import uuid from 'uuid';
import path from 'path';
import fs from 'mz/fs';
import eventToPromise from 'event-to-promise';

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
    return `${this.config.server.publicUrl}/blob/${key}`;
  }

  async write(key, reader) {
    let writer = fs.createWriteStream(path.join(
      this.path,
      key
    ));
    reader.pipe(writer);
    await waitForPipe(writer);
  }

  async read(key, writer) {
    let reader = fs.createReadStream(path.join(
      this.path,
      key
    ));
    reader.pipe(writer);
    await waitForPipe(writer);
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
