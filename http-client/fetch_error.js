/**
 * @flow
 */

import type {Headers, Response} from 'silk-fetch';

class HttpError extends Error {
  code: number;
  status: number;
  headers: ?Headers;
  body: ?string | ?Object;

  constructor(response: Response, text: string) {
    super(`\
${response.statusText} - ${response.url}

${text}
`);
    this.code = this.status = response.status;
    this.headers = response.headers;

    let body = text;
    if (response.headers) {
      let contentType = response.headers.get('Content-Type');
      if (contentType.indexOf('application/json') !== -1) {
        body = JSON.parse(text);
      }
    }
    this.body = body;
  }
}

export default function throwError(response: Response): Promise<void> {
  return response.text().then((text) => {
    throw new HttpError(response, text);
  });
}
