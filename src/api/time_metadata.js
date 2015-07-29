import fetchJson from './fetch_json';

export default function(config) {
  let baseUrl = config.server_url;  //eslint-disable-line
  return {
    create: fetchJson.bind(null, `${baseUrl}/device/metadata/`),
    findById: fetchJson.bind(null, `${baseUrl}/device/metadata/find/byid`),
    findByTime: fetchJson.bind(null, `${baseUrl}/device/metadata/find/bytime`)
  };
}

