/**
 * @flow
 */
import assert from 'assert';

import connectionString from '../src/connection_string';

suite('connection string', () => {
  let fixture = `DefaultEndpointsProtocol=https;AccountName=silkdatatestuseast;AccountKey=abc==;BlobEndpoint=https://silkdatatestuseast.blob.core.windows.net/;TableEndpoint=https://silkdatatestuseast.table.core.windows.net/;QueueEndpoint=https://silkdatatestuseast.queue.core.windows.net/;FileEndpoint=https://silkdatatestuseast.file.core.windows.net/`;

  test('parse', () => {
    let result = connectionString(fixture);
    assert.deepEqual(result, {
      protocol: 'https',
      account: 'silkdatatestuseast',
      accessKey: 'abc==',
      blobEndpoint: 'https://silkdatatestuseast.blob.core.windows.net/',
      tableEndpoint: 'https://silkdatatestuseast.table.core.windows.net/',
      queueEndpoint: 'https://silkdatatestuseast.queue.core.windows.net/',
      fileEndpoint: 'https://silkdatatestuseast.file.core.windows.net/',
    });
  });

});
