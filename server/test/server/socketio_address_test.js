import assert from 'assert';
import createContext from './context';
import createSocketioApi from '../../src/api/socketio';

suite('time metadata apis', () => {
  let context = createContext();
  let api;

  setup(() => {
    api = createSocketioApi({
      serverUrl: context.url
    });
  });

  test('get address', async () => {
    let addr = await api.address();
    assert.ok(addr.url);
  });
});

