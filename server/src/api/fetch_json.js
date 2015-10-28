import fetch from './fetch';
import throwError from './fetch_error';

const CONTENT_TYPE_JSON = 'application/json';

export default async function(url, body, method = 'POST', timeout = 30000) {
  let request = {
    method,
    headers: {
      'Accept': CONTENT_TYPE_JSON,
    },
    timeout,
  };

  if (body) {
    request.body = JSON.stringify(body);
    Object.assign(request.headers, {
      'Content-Type': CONTENT_TYPE_JSON,
      'Content-Length': request.body.length,
    });
  }

  let response = await fetch(url, request);
  if (!response.ok) {
    await throwError(response);
  }
  return response.json();
}
