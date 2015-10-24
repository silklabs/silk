import assert from 'assert';
import api from '../api';
import randomStream from '../random_stream';
import fetch from 'node-fetch';

import { VideoUploadOp } from '../../lib/outbox/blob_upload_operation';

suite('VideoUploadOperation', () => {

  let id;
  setup(() => {
    id = api.id.create();
  });

  test('Upload crash report...', async () => {
    let { stream, buffer } = randomStream();

    let operation = new VideoUploadOp({
      size: buffer.length,
      metadata: {
        metaType: 'video',
        deviceId: id.toString(),
        startUTC: Date.now(),
        endUTC: Date.now() + 1000,
        data: {},
      }
    });

    await operation.write(stream);

    // See if we can find it on the server...
    let result = await api.timeMeta.findOneAfterTime({
      metaType: 'video',
      deviceId: id.toString(),
      time: 0
    });

    let res = await fetch(result.url)
    let text = await res.text();
    assert.equal(text, buffer.toString());
  });

});
