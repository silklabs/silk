import assert from 'assert';
import createContext from '../server/context';
import eventToPromise from 'event-to-promise';
import createSocketIO from 'socket.io-client';

suite('routes', () => {
  let context = createContext();

  let deviceSocket, device, accountSocket, account;
  let secondDeviceSocket;
  setup(async () => {
    let pair = await context.testPair();
    device = pair.device;
    account = pair.account;

    await Promise.all([
      async () => {
        deviceSocket = device.api.socketioClient(createSocketIO, 'device');
        deviceSocket.open();
        await eventToPromise(deviceSocket, 'connect');
      }(),

      async () => {
        accountSocket = account.api.socketioClient(createSocketIO, 'account');
        accountSocket.open();
        await eventToPromise(accountSocket, 'connect');
      }(),

      async() => {
        let secondDevice = await context.registeredDevice(
          account.api.accessToken
        );
        secondDeviceSocket = secondDevice.api.socketioClient(createSocketIO, 'device');
        secondDeviceSocket.open();
        await eventToPromise(secondDeviceSocket, 'connect');
      }()
    ]);
  });

  async function emit(socket: any, name: string, ...args: any) {
    return new Promise((accept) => {
      socket.emit(name, ...args.concat(() => {
        accept();
      }));
    });
  }

  test('.join / new device', async () => {
    await emit(accountSocket, 'join', 'video-streams');
    let newDevice = eventToPromise(accountSocket, 'video-stream-new');
    await emit(deviceSocket, 'info', {
      name: 'name',
      // This is is overriden...
      id: 'yeah this is an id',
      now: Date.now()
    });
    let newDeviceResult = await newDevice;
    assert.equal(newDeviceResult.id, device.record.accessToken.publicKey);
  });

  test('.join / already connected device / leave', async () => {
    await emit(deviceSocket, 'info', {
      name: 'name',
      // This is is overriden...
      id: 'yeah this is an id',
      when: Date.now()
    });

    // Listen for new devices...
    let newDevice = eventToPromise(accountSocket, 'video-stream-new');
    await emit(accountSocket, 'join', 'video-streams');
    let newDeviceResult = await newDevice;
    assert.equal(newDeviceResult.id, device.record.accessToken.publicKey);

    // Ensure device is getting command to start video...
    let cmd = eventToPromise(deviceSocket, 'cmd');
    let room = `video-${device.record.accessToken.publicKey}`;
    await emit(accountSocket, 'join', room);
    let cmdResult = await cmd;
    assert.deepEqual(cmdResult, {
      video: true,
      diag: false,
      preview: false,
      msg: 'livestream'
    });

    // Leave the video room;
    let updateCmd = eventToPromise(deviceSocket, 'cmd');
    await emit(accountSocket, 'leave', room);
    await emit(deviceSocket, 'video', {
      when: Date.now(),
      contents: 'mp4'
    });

    // Turns off video nobody is listening...
    let updateCmdResult = await updateCmd;
    assert.deepEqual(updateCmdResult, {
      video: false,
      diag: false,
      preview: false,
      msg: 'livestream'
    });

    let deleteEvent = eventToPromise(accountSocket, 'video-stream-delete');
    deviceSocket.disconnect();
    let deleted = await deleteEvent;
    assert.equal(deleted.id, device.record.accessToken.publicKey);
  });

  test('(simple) .video / .leave', async () => {
    await emit(deviceSocket, 'info', {});
    let roomName = `video-${device.record.accessToken.publicKey}`;
    await emit(accountSocket, 'join', roomName);
    let videoEvent = eventToPromise(accountSocket, roomName);
    let event = {
      id: device.record.accessToken.publicKey,
      contents: 'mp4',
      when: Date.now()
    };
    await emit(deviceSocket, 'video', event);
    let result = await videoEvent;
    assert.equal(result.id, event.id);

    // Emit the event again after leaving the room...
    await emit(accountSocket, 'leave', roomName);
    // XXX: Sorta lame if we get round trip in over 100ms this breaks.
    let race = Promise.race([
      eventToPromise(accountSocket, roomName).then(() => {
        throw new Error('should not get event...');
      }),
      new Promise((accept) => setTimeout(accept, 100))
    ]);
    await emit(deviceSocket, 'video', event);
    await race;
  });

  test('.cmd - broadcast', async () => {
    let events = Promise.all([
      eventToPromise(deviceSocket, 'cmd'),
      eventToPromise(secondDeviceSocket, 'cmd'),
    ]);
    let cmd = { woot: true };
    await emit(accountSocket, 'cmd', cmd);
    let result = await events;
    for (let value of result) {
      assert.deepEqual(value, cmd);
    }
  });

  test('.cmd - single device', async () => {
    let event = eventToPromise(deviceSocket, 'cmd');
    let cmd = {
      woot: true,
      id: device.record.accessToken.publicKey
    };
    await emit(accountSocket, 'cmd', cmd);
    // Sorta lame test since we only test the positive case.
    let result = await event;
    assert.deepEqual(result, cmd);
  });

  test('.diag', async () => {
    await emit(deviceSocket, 'info', {});

    let roomName = `diag-${device.record.accessToken.publicKey}`;
    await emit(accountSocket, 'join', roomName);
    let event = eventToPromise(accountSocket, roomName);
    let cmd = {
      when: Date.now(),
      hi: 'hi',
    };
    await emit(deviceSocket, 'diag', cmd);
    let result = await event;
    assert.equal(result.when, cmd.when);
    assert.equal(result.hi, cmd.hi);
  });

  test('reconnections - device', async () => {
    deviceSocket.io.reconnectionDelay(1);
    deviceSocket.io.onclose('manual override');
    let reconnect = eventToPromise(deviceSocket, 'reconnect');
    deviceSocket.io.reconnect();
    await reconnect;
  });

  test('reconnections - account', async () => {
    accountSocket.io.reconnectionDelay(1);
    accountSocket.io.onclose('manual override');
    let reconnect = eventToPromise(accountSocket, 'reconnect');
    accountSocket.io.reconnect();
    await reconnect;
  });

});
