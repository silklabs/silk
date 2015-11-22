/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

import OSS from 'aliyun-oss';
import uuid from 'uuid';
import url from 'url';

let log = require('log')('blob-aliyun');

class AliyunBlobs {
  constructor(config) {
    log.debug('Created');
    this.config = config;

    this.common = require('./common')(config);

    this.aliyunMap = new Map();
  }

  _getOss(blobType) {
    let oss = this.aliyunMap.get(blobType);
    if (!oss) {
      const blobConfig = this.config.blobs.aliyun[blobType];
      if (blobConfig === undefined) {
        log.warn('aliyun blob unknown blobType', blobType);
        oss = null;
      } else {
        log.warn('aliyun blob new config', blobType, blobConfig);
        oss = new OSS.createClient(blobConfig);
        this.aliyunMap.set(blobType, oss);
      }
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
      object: blobType + '!' + uuid.v4(), // enbed blobType in object name
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

  getSignedUrl(getUrl) {
    let urlObj = url.parse(getUrl);

    // pathname looks like this '/blobType!uuid'
    let object = urlObj.pathname.slice(1); // remove leading '/'
    const blobType = decodeURIComponent(object).split('!')[0];

    let oss = this._getOss(blobType);
    if (!oss) {
      log.warn(`Bad URL, cannot sign: ${getUrl}`);
      return getUrl;
    }

    const blobConfig = this.config.blobs.aliyun[blobType];
    let { url: signedUrl } = oss.getSignedUrl({
      method: 'GET',
      bucket: blobConfig.bucket,
      object: object,
      headers: {},
      signHeaders: false,
    });

    log.warn(`Returning signed get url '${signedUrl}'`);
    return signedUrl;
  }
}

export default async function(config) {
  return new AliyunBlobs(config);
}
