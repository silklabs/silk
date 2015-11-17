/* @flow */

import assert from 'assert';
import {default as sign, parseUrl} from '../../src/server/sign_url';

suite('sign url', function() {
  let url = 'https://silk-blobs-dev-us-west-2.s3-us-west-2.amazonaws.com/bc82bd3e-eb0b-45ae-9a1a-3e5cd710b611';

  test('parseUrl', () => {
    let parsed = parseUrl(url);
    assert.deepEqual(parsed, {
      cloud: 'aws',
      region: 'us-west-2',
      bucket: 'silk-blobs-dev-us-west-2',
      key: 'bc82bd3e-eb0b-45ae-9a1a-3e5cd710b611'
    });
  });

  if (!process.env.AWS_ACCESS_KEY_ID) {
    test.skip('Cannot run test without AWS_ACCESS_KEY_ID');
    return;
  }

  test('get signed url', () => {
    let signed = sign(url);
    assert(signed.indexOf(process.env.AWS_ACCESS_KEY_ID) !== -1);
  });

});
