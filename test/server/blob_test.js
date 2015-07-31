import assert from 'assert';
import createContext from './context';
import createBlobApi from '../../src/api/blob';
import fetch from 'node-fetch';
import { exec } from 'mz/child_process';

suite('blob', () => {
  suiteTeardown(async () => {
    await exec(`rm -rf ${__dirname}/fixtures/blobs`);
  });

  suite('File', () => {
    let context = createContext({
      server: {
        blobType: 'file'
      },

      blobs: {
        file: {
          path: `${__dirname}/fixtures/blobs/`
        }
      }
    });

    let blob;
    setup(() => {
      blob = createBlobApi({ server_url: context.url });  //eslint-disable-line
    });

    test('/blob/ - signing', async () => {
      let object = { foo: 'bar' };
      let input = JSON.stringify(object);
      let content = new Buffer(input);
      let { url } = await blob.uploadAndAck(
        content.length,
        content,
        // intentionally just json otherwise we will hit the body parser and
        // upload will fail.
        'json'
      );
      let response = await fetch(url);
      let text = await response.text();
      assert.equal(text, input);
      assert.equal(response.headers.get('Content-Type'), 'json');
    });
  });


  suite('S3', () => {
    let context = createContext({
      server: {
        blobType: 's3'
      }
    });

    if (!process.env.AWS_ACCESS_KEY_ID) {
      test.skip('Skipping s3 blob tests: No AWS credentials are present');
      return;
    }

    let blob;
    setup(() => {
      blob = createBlobApi({ server_url: context.url });  //eslint-disable-line
    });

    test('/blob/ - signing', async () => {
      let object = { foo: 'bar' };
      let input = JSON.stringify(object);
      let content = new Buffer(input);
      let { url } = await blob.uploadAndAck(
        content.length,
        content,
        'application/json'
      );
      let response = await fetch(url);
      assert.equal(response.headers.get('Content-Type'), 'application/json');
      let text = await response.text();
      assert.equal(text, input);
    });
  });

});
