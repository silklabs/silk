/**
 * Helper for constructing http requests via nodes standard low level
 * mechanisms.
 *
 * ```js
 * let stream = httpStream('http://google.com', { method: 'put' });
 * ``
 */

import URL from 'url';

export default function(url, overrides = {}) {
  let params = URL.parse(url);
  Object.assign(params, overrides);

  let module = (params.protocol === 'https:') ?
    require('https') :
    require('http');

  return module.request(params);
}
