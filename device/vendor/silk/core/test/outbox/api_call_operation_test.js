import createApi from '../api';

import APICallOperation from '../../lib/outbox/api_call_operation';

suite('APICallOperation', () => {

  test('make simple api call', async () => {
    if (require('../skip-on-travis.js')()) return;

    // Ensure api has been bootstrapped.
    await createApi();
    let operation = new APICallOperation({
      endpoint: 'device.socketioURL',
      args: []
    });
    await operation.write(null);
  });

});
