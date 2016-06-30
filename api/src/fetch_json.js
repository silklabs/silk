/**
 * @flow
 */
import fetch, {Headers} from 'silk-fetch';
import throwError from './fetch_error';

import type {FetchOptions} from 'silk-fetch';

const CONTENT_TYPE_JSON = 'application/json';

export default async function(
  url: string,
  body: Object,
  method: string = 'POST',
  timeout: number = 30000
): Promise<Object> {
  let request: FetchOptions = {
    method,
    timeout,
  };
  let headers = request.headers = new Headers({
    'Accept': CONTENT_TYPE_JSON,
  });

  if (body) {
    request.body = JSON.stringify(body);
    headers.set('Content-Type', CONTENT_TYPE_JSON);
    headers.set('Content-Length', body.length);
  }

  let response = await fetch(url, request);
  if (!response.ok) {
    await throwError(response);
  }
  return response.json();
}
