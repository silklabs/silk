import fetchJson from './fetch_json';
import { resolve } from 'url';

const SERVER_PATH_PREFIX = '/socketio';

export default function(config) {
  let baseUrl = config.serverUrl;  //eslint-disable-line
  return {
    address: () => {
      let url = resolve(baseUrl, `${SERVER_PATH_PREFIX}/address`);
      return fetchJson(url, null, 'GET');
    }
  };
}
