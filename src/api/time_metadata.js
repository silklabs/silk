import fetchJson from './fetch_json';
import { resolve } from 'url';

export default function(config) {
  let baseUrl = config.serverUrl;  //eslint-disable-line
  return {
    create: fetchJson.bind(null, resolve(baseUrl, '/device/metadata/')),
    findById: fetchJson.bind(null, resolve(baseUrl, '/device/metadata/find/byid')),
    findByTime: fetchJson.bind(null, resolve(baseUrl, '/device/metadata/find/bytime'))
  };
}

