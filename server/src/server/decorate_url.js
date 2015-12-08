/**
 * This module is a short term hack to allow signing urls which may return s3 blobs.
 *
 * @flow
 */

import signUrl from './sign_url';

type ObjectWithUrl = {
  url: ?string;
}

// XXX: Hack until we convert over to more robust blobs.
export default function decorateUrl(obj: ObjectWithUrl): ObjectWithUrl {
  if (obj.url) {
    obj.url = signUrl(obj.url);
  }
  return obj;
}
