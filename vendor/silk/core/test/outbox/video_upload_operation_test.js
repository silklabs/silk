import assert from 'assert';
import createApi from '../api';
import randomStream from '../random_stream';
import fetch from 'node-fetch';

import { VideoUploadOp } from '../../lib/outbox/blob_upload_operation';
import mkLog from '../../lib/log'; const log = mkLog('ut');

suite('VideoUploadOperation', () => {

  test('Upload video...', async () => {
    if (require('../skip-on-travis.js')()) return;

    let { device, account } = await createApi();
    let { stream, buffer } = randomStream();

    let operation = new VideoUploadOp({
      size: buffer.length,
      metadata: {
        metaType: 'video',
        startUTC: Date.now(),
        endUTC: Date.now() + 1000,
        data: {},
      }
    });

    log.info('Uploading video');
    await operation.write(stream);

    log.info('See if we can find it on the server...');
    let result = await account.metadata.findOneAfterTime({
      metaType: 'video',
      deviceId: device.accessToken.toString(),
      time: 0
    });
    log.info('Found it:', result);

    log.info('Fetching', result.url);
    let res = await fetch(result.url)
    let text = await res.text();
    assert.equal(text, buffer.toString());
  });

});
