import createContext from '../server/context';
import eventToPromise from 'event-to-promise';
import createSocketIO from 'socket.io-client';

suite('secured socket.io connections...', () => {
  let context = createContext();

  test('connect as device', async () => {
    let {device: {api}} = await context.testPair();

    let socketConfig = await api.socketioDeviceConfig();
    let socket = createSocketIO(...socketConfig);
    await eventToPromise(socket, 'connect');
  });

  test('connect as account', async () => {
    let {account: {api}} = await context.testPair();

    let socketConfig = await api.socketioAccountConfig();
    let socket = createSocketIO(...socketConfig);
    await eventToPromise(socket, 'connect');
  });

});
