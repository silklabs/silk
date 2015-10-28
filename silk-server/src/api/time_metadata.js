import fetchJson from './fetch_json';
import { resolve } from 'url';

const SERVER_PATH_PREFIX = '/device/metadata/time';

export default function(config) {
  let baseUrl = config.serverUrl;  //eslint-disable-line
  return {
    create: fetchJson.bind(null, resolve(baseUrl, SERVER_PATH_PREFIX)),
    update: (id, payload) => fetchJson(resolve(baseUrl, `${SERVER_PATH_PREFIX}/${id}`), payload),
    findById: fetchJson.bind(null, resolve(baseUrl, `${SERVER_PATH_PREFIX}/find/byid`)),
    findByTime: fetchJson.bind(null, resolve(baseUrl, `${SERVER_PATH_PREFIX}/find/bytime`)),
    findInTimeInterval: fetchJson.bind(null, resolve(baseUrl, `${SERVER_PATH_PREFIX}/find/ininterval`)),
    findOneAfterTime: fetchJson.bind(null, resolve(baseUrl, `${SERVER_PATH_PREFIX}/find/bytime/after`)),
    findBeforeTime: fetchJson.bind(null, resolve(baseUrl, `${SERVER_PATH_PREFIX}/find/bytime/before`))
  };
}
