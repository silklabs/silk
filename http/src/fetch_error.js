export default async function throwError(response) {
  let text = await response.text();
  let err = new Error(`
    ${response.statusText} - ${response.url}

    ${text}
  `);

  err.code = err.status = response.status;
  err.headers = response.headers;

  if (response.headers) {
    let contentType = response.headers.get('Content-Type');
    let body = text;
    if (contentType.indexOf('application/json') !== -1) {
      body = JSON.parse(text);
    }
    err.body = body;
  }

  throw err;
}
