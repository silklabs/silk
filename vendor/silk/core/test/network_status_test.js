import assert from 'assert';
import eventToPromise from 'event-to-promise';
import EventEmitter from 'events';
import NetworkStatus from '../lib/network_status';

suite('network_status', () => {

  function createNetworkStatus(interval = 1, overrides = {}) {
    let state = Object.assign({}, {
      wifiOnline: false,
      isOnline: false,
    }, overrides);

    state.wifi = new EventEmitter();
    state.wifi.isOnline = () => {
      return state.wifiOnline;
    };

    let isOnlineFn = () => {
      return Promise.resolve(state.isOnline);
    };

    state.subject = new NetworkStatus(state.wifi, isOnlineFn, interval);
    return state;
  }


  test('initial state', async () => {
    let { subject } = createNetworkStatus();
    assert.equal(subject.online, false);
  });

  test('offline -> online -> offline', async () => {
    let state = createNetworkStatus();
    // do wifi "flicker"
    state.wifi.emit('online');

    setTimeout(() => {
      state.isOnline = true;
    }, 10);

    await eventToPromise(state.subject, 'online');
    state.isOnline = false;

    let offlineEvent = eventToPromise(state.subject, 'offline');
    state.wifi.emit('offline');
    await offlineEvent;
  });

  test('hit socket online/offline', async function() {
    this.timeout('1s');

    let interval = 2000;
    let state = createNetworkStatus(interval, {
      wifiOnline: true
    });

    /**
     * Wait until we are waiting for the longer timeout before setting the hint
     * server...
     */
    await new Promise((accept) => {
      state.subject.on('check failure', function check() {
        if (interval >= 2000) {
          state.subject.removeListener('check failure', check);
          accept();
        }
      });
    });

    // The hint socket should reset the timeout when it emits connect.
    let socket = new EventEmitter();
    state.isOnline = true;
    state.subject.hintSocket = socket;
    let online = eventToPromise(state.subject, 'online');
    socket.emit('connect');
    await online;
  });

});
