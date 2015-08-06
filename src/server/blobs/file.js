/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

import eventToPromise from 'event-to-promise';
import fs from 'mz/fs';
import path from 'path';
import url from 'url';
import uuid from 'uuid';

let log = require('../log')('blob-file');

const KEY_GENERATOR_ATTEMPTS_MAX = 10;

async function createDirIfNotExists(dirPath) {
  try {
    await fs.mkdir(dirPath);
  } catch (err) {
    if (err.code !== 'EEXIST' && err.code !== 'EISDIR') {
      throw err;
    }
  }
}

async function unlinkIfExists(filePath) {
  try {
    await fs.unlink(filePath);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      throw err;
    }
  }
}

function waitForPipe(writer) {
  return Promise.race([
    eventToPromise(writer, 'error').then(err => {
      throw err;
    }),
    eventToPromise(writer, 'finish')
  ]);
}

class FileBlobHandler {
  constructor(blobPaths, config) {
    log.debug(`Created with paths: ` + JSON.stringify(blobPaths));

    this.blobPaths = blobPaths;
    this.config = config;

    this.keyMap = new Map();
    this.putUrlMap = new Map();

    this.common = require('./common')(config);
  }

  async postBlob(req, res) {
    if (!this.common.validatePostBlob(req, res)) {
      return;
    }

    const blobType = req.params.type;
    const contentType = req.body.contentType;
    const contentLength = req.body.contentLength;

    log.info(`Received POST request for '/blob/${blobType}': ` +
             `'${contentType}' (${contentLength})`);

    let key;
    for (let i = 0; i < KEY_GENERATOR_ATTEMPTS_MAX; i++) {
      const testKey = uuid.v4();
      const testKeyPath = path.join(this.blobPaths[blobType], testKey);
      const exists = await fs.exists(testKeyPath);
      if (!exists) {
        key = testKey;
        break;
      }
      log.warn('Key generator collision');
    }

    if (!key) {
      throw new Error(`Failed to generate new key`);
    }

    const headersPath = path.join(this.blobPaths[blobType], `${key}.json`);

    const savedHeaders = {
      contentLength,
      contentType
    };

    try {
      await fs.writeFile(headersPath, JSON.stringify(savedHeaders));
    } catch(err) {
      await unlinkIfExists(headersPath);
      throw err;
    }

    const putUrl = url.resolve(this.config.server.publicUrl,
                               `blob/${blobType}/${key}`);

    let metadata = {
      blobType,
      key,
      putUrl,
      contentLength,
      contentType
    };

    this.keyMap.set(key, metadata);
    this.putUrlMap.set(putUrl, metadata);

    log.info(`Responding with PUT url '${putUrl}'`);

    res.status(201).send({ putUrl });
  }

  async putBlob(req, res) {
    if (!this.common.validatePutBlob(req, res)) {
      return;
    }

    const blobType = req.params.type;
    const key = req.params.id;

    const metadata = this.keyMap.get(key);
    if (!metadata) {
      log.warn(`Invalid key: ${key}`);
      res.sendStatus(404);
      return;
    }

    const contentType = req.headers['content-type'].toLowerCase();
    if (contentType !== metadata.contentType) {
      log.warn(`'Content-Type' header doesn't match POST request: ` +
               `'${req.headers['content-type']}'`);
      res.status(403).send(`Invalid 'Content-Type'`);
      return;
    }

    const contentLength = parseInt(req.headers['content-length']);
    if (contentLength !== metadata.contentLength) {
      log.warn(`'Content-Length' header doesn't match POST request: ` +
               `'${req.headers['content-length']}'`);
      res.status(403).send(`Invalid 'Content-Length'`);
      return;
    }

    log.info(`Received PUT request for '/blob/${blobType}/${key}': ` +
             `'${contentType}' (${contentLength})`);

    const blobPath = path.join(this.blobPaths[blobType], key);
    log.info(`Writing to '${blobPath}'`);

    let writer = fs.createWriteStream(blobPath);
    req.pipe(writer);

    try {
      await waitForPipe(writer);
    } catch(err) {
      log.warn(`Failed to write to '${blobPath}', unlinking`);
      await unlinkIfExists(blobPath);
      throw err;
    }

    log.debug(`Writing complete`);

    res.sendStatus(201);
  }

  async postAck(req, res) {
    if (!this.common.validatePostAck(req, res)) {
      return;
    }

    const putUrl = req.body.url;

    const metadata = this.putUrlMap.get(putUrl);
    if (!metadata) {
      log.warn(`Ack with invalid url: ${putUrl}`);
      res.sendStatus(404);
      return;
    }

    log.info(`Received POST request for '/blob/ack': '${putUrl}'`);

    this.keyMap.delete(metadata.key);
    this.putUrlMap.delete(putUrl);

    log.info(`Responding with GET url '${putUrl}'`);

    res.append('Location', putUrl);
    res.status(201).send({ url: putUrl });
  }

  async getBlob(req, res) {
    const blobType = req.params.type;
    const key = req.params.id;

    if (!(blobType in this.blobPaths)) {
      log.warn(`GET with invalid blob type: ${blobType}`);
      res.sendStatus(404);
      return;
    }

    log.info(`Received GET request for '/blob/${blobType}/${key}'`);

    const blobPath = path.join(this.blobPaths[blobType], key);

    const exists = await fs.exists(blobPath);
    if (!exists) {
      log.warn(`Unknown key '${key}'`);
      res.sendStatus(404);
      return;
    }

    const headersPath = path.join(this.blobPaths[blobType], `${key}.json`);
    const headers = JSON.parse(await fs.readFile(headersPath));

    res.set({
      'Content-Type': headers.contentType,
      'Content-Length': headers.contentLength
    });
    res.status(200);

    log.info(`Responding with '${headers.contentType}' ` +
             `(${headers.contentLength})`);
    fs.createReadStream(blobPath).pipe(res);
  }
}

export default async function(config) {
  let blobPaths = { };

  const blobConfigs = config.blobs.file;
  for (let blobType in blobConfigs) {
    const blobPath = blobConfigs[blobType].path;
    const directories = path.normalize(blobPath).split(path.sep);

    let constructedPath = '';
    for (let directory of directories) {
      if (directory) {
        constructedPath += directory + path.sep;
        await createDirIfNotExists(constructedPath);
      }
    }

    blobPaths[blobType] = constructedPath;
  }

  return new FileBlobHandler(blobPaths, config);
}
