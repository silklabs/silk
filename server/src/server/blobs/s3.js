/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

import { S3 } from 'aws-sdk-promise';
import url from 'url';
import uuid from 'uuid';

let log = require('log')('blob-s3');

class S3Blobs {
  constructor(config) {
    log.debug('Created');
    this.config = config;

    this.common = require('./common')(config);

    this.s3Map = new Map();
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

    const blobConfig = this.config.blobs.s3[blobType];

    let s3 = this.s3Map.get(blobType);
    if (!s3) {
      s3 = new S3(blobConfig);
      this.s3Map.set(blobType, s3);
    }

    let putUrl = await s3.getSignedUrl('putObject', {
      Bucket: blobConfig.bucket,
      Key: uuid.v4(),
      ContentType: contentType
    });

    log.info(`Responding with PUT url '${putUrl}'`);

    res.status(201).send({ putUrl });
  }

  async postAck(req, res) {
    if (!this.common.validatePostAck(req, res)) {
      return;
    }

    log.info(`Received POST request for '/blob/ack': '${req.body.url}'`);

    // This looks sketchy because it is in the short term we simply snip off the
    // signature details from our urls if they exist allowing this api to
    // function (providing a long term url or token for a blob).
    let getUrlObj = url.parse(req.body.url);
    delete getUrlObj.search;
    delete getUrlObj.query;
    delete getUrlObj.hash;

    const getUrl = url.format(getUrlObj);

    log.info(`Responding with GET url '${getUrl}'`);

    res.append('Location', getUrl);
    res.status(201).send({ url: getUrl });
  }
}

export default async function(config) {
  return new S3Blobs(config);
}
