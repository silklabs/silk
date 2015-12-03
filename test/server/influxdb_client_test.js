/* @flow */
import assert from 'assert';
import Influx from '../../src/server/influxdb_client';
import uuid from 'uuid';

suite('influxdb client', function() {

  let enabled =
    !!process.env.INFLUX_CONNECTION_STRING;

  if (!enabled) {
    test.skip('process.env.INFLUX_CONNECTION_STRING must be present.');
    return;
  }

  let client;
  setup(async() => {
    client = new Influx(process.env.INFLUX_CONNECTION_STRING || '');
  });

  test('setup client', async () => {
    let ping = await client.ping();
    assert(ping.version, 'can ping the server...');
  });

  test('write point', async () => {
    let series = uuid.v4().replace(/-/g, '');
    let point = [series, { mytag: `'a'` }, {  data: '"woot"' }];
    for (var i = 0; i < 2; i++) {
      await client.write(point);
    }

    let query = await client.query(`
      SELECT * FROM ${series}
    `);
    assert(query.results, 'can query');
  });

});
