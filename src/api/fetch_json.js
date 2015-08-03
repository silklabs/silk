import fetch from './fetch';
import throwError from './fetch_error';

export default async function(url, body, method = 'POST') {
  let request = {
    method,
    headers: {}
  };

  if (body) {
    request.headers.Accept = 'application/json';
    request.headers['Content-Type'] = 'application/json';
    request.body = JSON.stringify(body);
  }

  let response = await fetch(url, request);
  if (!response.ok) {
    await throwError(response);
  }
  return response.json();
}
