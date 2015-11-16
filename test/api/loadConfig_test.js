import assert from 'assert';
import createApi from '../../src/api';

suite('loadConfig', () => {
  test('reload', async () => {

    let api = createApi();
    const defaultUrl = api.config.serverUrl;
    api.accessToken = 'Open Sesame';

    // Override server Url
    api.loadConfig({serverUrl:'example.com'});
    assert.equal(api.config.serverUrl, 'example.com');

    // Restore default Url
    api.loadConfig();
    assert.equal(api.config.serverUrl, defaultUrl);

    // Ensure access token has been preserved
    assert.equal(api.accessToken, 'Open Sesame');
  });

});
