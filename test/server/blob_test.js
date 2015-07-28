import assert from 'assert';
import createContext from './context';

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

    test('/blob/ - signing', async () => {
      let result = await context.post('/blob/');
      assert.equal(result.status, 201);
      let { putUrl } = result.body;
      assert.ok(putUrl.indexOf('localhost') === -1, 'returns s3 url');

      let ack = await context.post('/blob/ack', {
        url: putUrl
      });
      assert.equal(ack.statusCode, 201);
      assert.equal(ack.body.url, putUrl.split('?')[0]);
    });
  });

});
