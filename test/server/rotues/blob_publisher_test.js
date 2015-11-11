import assert from 'assert';
import createContext from '../context';
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

    let device;
    setup(async function() {
      device = await context.testDevice();
      context.api.accessToken = device.accessToken;
    });

    let object = { foo: 'bar' };
    let input = JSON.stringify(object);
    let content = new Buffer(input);
    let url;
    setup(async () => {
      let putSigned = await context.api.blobv2.putUrl('video', {
        contentLength: content.length,
        contentType: 'application/json'
      });

      let res = await fetch(putSigned.putUrl, {
        method: 'PUT',
        headers: putSigned.putHeaders,
        body: content.toString()
      });

      assert(res.ok, 'successfully puts');
      let ack = await context.api.blobv2.ack({
        url: putSigned.putUrl
      });
      url = ack.url;
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

    let device;
    setup(async function() {
      device = await context.testDevice();
      context.api.accessToken = device.accessToken;
    });

    test('/blob/ - signing', async () => {
      let object = { foo: 'bar' };
      let input = JSON.stringify(object);
      let content = new Buffer(input);

      let putSigned = await context.api.blobv2.putUrl('video', {
        contentLength: content.length,
        contentType: 'application/json'
      });

      let res = await fetch(putSigned.putUrl, {
        method: 'PUT',
        headers: putSigned.putHeaders,
        body: content.toString()
      });

      assert(res.ok, 'successfully puts');
      let ack = await context.api.blobv2.ack({
        url: putSigned.putUrl
      });

      let response = await fetch(ack.url);
      assert.equal(response.headers.get('Content-Type'), 'application/json');
      let text = await response.text();
      assert.equal(text, input);
    });
  });
});
