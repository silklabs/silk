/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

import OSS from 'aliyun-oss';
import uuid from 'uuid';

let log = require('log')('blob-aliyun');

class AliyunBlobs {
  constructor(config) {
    log.debug('Created');
    this.config = config;

    this.common = require('./common')(config);

    this.aliyunMap = new Map();
  }

  _getOss(blobType) {
    const blobConfig = this.config.blobs.aliyun[blobType];

    let oss = this.aliyunMap.get(blobType);
    if (!oss) {
      log.warn('aliyun blob config', blobType, blobConfig);
      oss = new OSS.createClient(blobConfig);
      this.aliyunMap.set(blobType, oss);
    }
    return oss;
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

    const blobConfig = this.config.blobs.aliyun[blobType];
    let oss = this._getOss(blobType);

    let headers = {
      'Content-Type': contentType,
      'Content-Length': contentLength,
    };

    let { url: putUrl, headers: putHeaders } = await oss.getSignedUrl({
      method: 'PUT',
      bucket: blobConfig.bucket,
      object: uuid.v4(),
      headers: headers
    });

    log.info(`Responding with PUT url '${putUrl}'`);

    res.status(201).send({ putUrl, putHeaders });
  }

  async postAck(req, res) {
    if (!this.common.validatePostAck(req, res)) {
      return;
    }

    log.info(`Received POST request for '/blob/ack': '${req.body.url}'`);

    // The get url is just the put url
    let getUrl = req.body.url;

    log.info(`Responding with GET url '${getUrl}'`);

    res.append('Location', getUrl);
    res.status(201).send({ url: getUrl });
  }
}

export default async function(config) {
  return new AliyunBlobs(config);
}
