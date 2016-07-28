/**
 * @noflow
 */

// TODO: de-dupe with silk-http-client/fetch_error?
export default async function throwError(response) {
  let text = await response.text();
  let err = new Error(`
    ${response.statusText} - ${response.url}

    ${text}
  `);

  err.code = err.status = response.status;
  err.headers = response.headers;
  throw err;
}
