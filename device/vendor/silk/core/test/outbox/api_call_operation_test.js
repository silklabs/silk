import createApi from '../api';
import skipOnTravis from '../skip-on-travis.js';

import APICallOperation from '../../lib/outbox/api_call_operation';

suite('APICallOperation', () => {

  test('make simple api call', async () => {
    if (skipOnTravis()) {
      return;
    }

    // Ensure api has been bootstrapped.
    await createApi();
    let operation = new APICallOperation({
      endpoint: 'device.socketioURL',
      args: []
    });
    await operation.write(null);
  });

});
