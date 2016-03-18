import assert from 'assert';
import getHostname from '../src/get_hostname';

suite('private ip', () => {

  const OLD_SILK_HOST = process.env.SILK_HOST;
  suiteTeardown(() => {
    process.env.SILK_HOST = OLD_SILK_HOST;
  });

  test('get hostname', async () => {
    // hard to test without docker.. this is purely so we know it does not fail.
    process.env.SILK_HOST = null;
    await getHostname();

    process.env.SILK_HOST = 'localhost';
    const host = await getHostname();
    assert.equal(host, process.env.SILK_HOST);
  });

});
