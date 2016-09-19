/**
 * Flow safe url formatting of url parsed objects.
 *
 * @flow
 */

import URL from 'url';

export default function formatURL(parsed: {
  auth?: string;
  protocol?: string;
  slashes?: boolean;
  host?: string;
  pathname?: string;
  search?: string;
  query?: Object;
}): string {
  return URL.format({
    auth: parsed.auth,
    protocol: parsed.protocol,
    slashes: parsed.slashes,
    host: parsed.host,
    query: parsed.query,
    pathname: parsed.pathname,
  });
}
