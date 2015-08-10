/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

import * as Joi from 'joi';

let log = require('../log')('blob-common');

const BLOB_SIZE_MAX = 1024 * 1024 * 10; // 10MB
const CONTENT_TYPE_JSON = 'application/json';

const SCHEMA = {
  postBlob: Joi.object().keys({
    contentLength: Joi.number().integer().min(0).max(BLOB_SIZE_MAX).required(),
    contentType: Joi.string().required(),
  }).required(),

  postAck: Joi.object().keys({
    url: Joi.string().uri().required()
  }).required(),
};

function validateBlobTypeAndHeaders(config, forceContentType, req, res) {
  if (config) {
    const blobType = req.params.type;

    if (!(blobType in config.blobs[config.server.blobType])) {
      log.warn(`Invalid blob type: ${blobType}`);
      res.sendStatus(404);
      return false;
    }
  }

  if (!('content-length' in req.headers)) {
    log.warn(`No 'Content-Length' header`);
    res.sendStatus(411);
    return false;
  }

  const contentLength = parseInt(req.headers['content-length']);
  if (isNaN(contentLength) || contentLength < 0) {
    log.warn(`Invalid 'Content-Length' header: '` +
             `${req.headers['content-length']}'`);
    res.status(403).send(`Invalid 'Content-Length'`);
    return false;
  }

  if (contentLength > BLOB_SIZE_MAX) {
    log.warn(`'Content-Length' too large: ${contentLength}`);
    res.sendStatus(413);
    return false;
  }

  if (!('content-type' in req.headers)) {
    log.warn(`No 'Content-Type' header`);
    res.status(403).send(`'Content-Type' required`);
    return false;
  }

  if (forceContentType) {
    const contentType = req.headers['content-type'].toLowerCase();
    if (contentType !== forceContentType) {
      log.warn(`Invalid 'Content-Type' header: ` +
               `'${req.headers['content-type']}'`);
      res.status(403).send(`'Content-Type' must be '${forceContentType}'`);
      return false;
    }
  }

  return true;
}

function validatePostBlob(config, req, res) {
  if (!validateBlobTypeAndHeaders(config, CONTENT_TYPE_JSON, req, res)) {
    return false;
  }

  try {
    Joi.assert(req.body, SCHEMA.postBlob);
  } catch(e) {
    log.warn(`${e}: ` + JSON.stringify(req.body));
    res.sendStatus(400);
    return false;
  }

  // TODO: Whitelist certain Content-Type values for the blob?

  return true;
}

function validatePostAck(req, res) {
  if (!validateBlobTypeAndHeaders(null, CONTENT_TYPE_JSON, req, res)) {
    return false;
  }

  try {
    Joi.assert(req.body, SCHEMA.postAck);
  } catch(e) {
    log.warn(`${e}: ` + JSON.stringify(req.body));
    res.sendStatus(400);
    return false;
  }

  return true;
}

export default function(config) {
  return {
    validatePostBlob: validatePostBlob.bind(null, config),
    validatePutBlob: validateBlobTypeAndHeaders.bind(null, config, null),
    validatePostAck
  };
}
