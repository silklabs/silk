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
          video: {
            path: `${__dirname}/fixtures/blobs/video/`
          },
          crashreport: {
            path: `${__dirname}/fixtures/blobs/crashreport/`
          },
          log: {
            path: `${__dirname}/fixtures/blobs/log/`
          },
          metrics: {
            path: `${__dirname}/fixtures/blobs/metrics/`
          }
        }
      }
    });

    let blob;
    let object = { foo: 'bar' };
    let input = JSON.stringify(object);
    let content = new Buffer(input);
    let url;
    setup(async () => {
      blob = createBlobApi({ serverUrl: context.url });
      url = await blob.upload(
        'video',
        content.length,
        'application/json',
        content
      );
    });

    test('/blob/ - signing full content', async () => {
      let response = await fetch(url);
      let text = await response.text();
      assert.equal(text, input);
      assert.equal(response.headers.get('Content-Type'), 'application/json');
    });

    test('/blob/ - byte range', async () => {
      // byte range:
      let response = await fetch(url, {
        headers: {
          Range: 'bytes=0-1'
        }
      });
      let text = await response.text();
      assert.equal('{"', text);
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
      blob = createBlobApi({ serverUrl: context.url });
    });

    test('/blob/ - signing', async () => {
      let object = { foo: 'bar' };
      let input = JSON.stringify(object);
      let content = new Buffer(input);
      let url = await blob.upload(
        'video',
        content.length,
        'application/json',
        content,
      );
      let response = await fetch(url);
      assert.equal(response.headers.get('Content-Type'), 'application/json');
      let text = await response.text();
      assert.equal(text, input);
    });
  });
});
