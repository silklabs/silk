import assert from 'assert';
import createContext from './context';
import createBlobApi from '../../src/api/blob';
import fetch from 'node-fetch';

suite('blob', () => {

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
      let input = 'woot bar';
      let content = new Buffer(input);
      let { url } = await blob.uploadAndAck(content.length, content);
      let response = await fetch(url);
      let text = await response.text();
      assert.equal(text, input);
    });
  });

});
