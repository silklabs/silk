/**
 * Temporary hack for AWS only signatures.
 *
 * @flow
 */


import {S3} from 'aws-sdk-promise';
import URL from 'url';

export type BlobConfig = {
  cloud: string;
  region: string;
  key: string;
  bucket: string;
}

const SECONDS_IN_HOUR = 60 * 60;

export function parseUrl(url: string): BlobConfig {
  let parsed = URL.parse(url);
  if (!parsed.path || !parsed.host) {
    throw new Error('Path is required... invalid url given');
  }

  let path: string = parsed.path;
  let host: string = parsed.host;

  let key = path.slice(1);

  // XXX: This is not quite correct for AWS there are a few different methods
  // of specifying the URL but we only use one region and one format.
  let [bucket, region] = host.split('.');
  // looks like s3-us-west-2 we just want the us-west-2 part.
  region = region.slice(3);

  return {
    cloud: 'aws',
    region,
    bucket,
    key
  };
}

// XXX: More hacks we should use a class and support more clouds...
let s3;
export default function signUrl(url: string, expireInSeconds: number = SECONDS_IN_HOUR): string {
  // XXX: Another hack to support file backed blobs.
  if (url.indexOf('aws') === -1) {
    return url;
  }

  if (!s3) {
    s3 = new S3();
  }

  let {key, bucket} = parseUrl(url);

  return s3.getSignedUrl('getObject', {
    Key: key,
    Bucket: bucket,
    // Units in seconds...
    Expires: expireInSeconds
  });
}
