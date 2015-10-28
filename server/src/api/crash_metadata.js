/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

import fetchJson from './fetch_json';
import { resolve } from 'url';

const SERVER_PATH_PREFIX = '/device/metadata/crashreport';

async function put(url, body) {
  const { id } = await fetchJson(url, body);
  return id;
}

async function get(url, id) {
  return await fetchJson(resolve(url, id), null, 'GET');
}

async function find(url, body) {
  return await fetchJson(url, body);
}

export default function(config) {
  const baseUrl = resolve(config.serverUrl, SERVER_PATH_PREFIX);
  return {
    put: put.bind(null, baseUrl),
    get: get.bind(null, baseUrl + '/'),
    find: find.bind(null, resolve(baseUrl + '/', 'find'))
  };
}
