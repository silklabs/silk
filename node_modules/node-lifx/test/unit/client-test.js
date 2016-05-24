'use strict';

var Client = require('../../').Client;
var Light = require('../../').Light;
var packet = require('../../').packet;
var constants = require('../../').constants;
var assert = require('chai').assert;
var lolex = require('lolex');

suite('Client', () => {
  let client;
  let clock;
  const getMsgQueueLength = () => {
    return client.messagesQueue.length;
  };
  const getDeviceCount = () => {
    return Object.keys(client.devices).length;
  };

  beforeEach(() => {
    client = new Client();
    client.devices['192.168.0.1'] = new Light({
      client: client,
      id: 'F37A4311B857',
      address: '192.168.0.1',
      port: constants.LIFX_DEFAULT_PORT,
      seenOnDiscovery: 0
    });
  });

  afterEach(() => {
    client.destroy();
  });

  test('not connected by default', () => {
    assert.isNull(client.address());
  });

  test('connected after init', (done) => {
    client.init({}, () => {
      assert.isObject(client.address());
      assert.property(client.address(), 'address');
      assert.property(client.address(), 'port');
      done();
    });
  });

  test('accepts init parameters', (done) => {
    client.init({
      address: '127.0.0.1',
      port: 57500,
      source: '12345678',
      lightOfflineTolerance: 2,
      messageHandlerTimeout: 12000,
      resendPacketDelay: 200,
      resendMaxTimes: 2
    }, () => {
      assert.equal(client.address().address, '127.0.0.1');
      assert.equal(client.address().port, 57500);
      assert.equal(client.source, '12345678');
      assert.equal(client.lightOfflineTolerance, 2);
      assert.equal(client.messageHandlerTimeout, 12000);
      assert.equal(client.resendPacketDelay, 200);
      assert.equal(client.resendMaxTimes, 2);
      done();
    });
  });

  test('init parameters of wrong types throw exception', () => {
    assert.throw(() => {
      client.init({port: '57500'});
    }, TypeError);

    assert.throw(() => {
      client.init({source: 23456789});
    }, TypeError);

    assert.throw(() => {
      client.init({source: 'Test'});
    }, RangeError);

    assert.throw(() => {
      client.init({lightOfflineTolerance: '3'});
    }, TypeError);

    assert.throw(() => {
      client.init({messageHandlerTimeout: '30000'});
    }, TypeError);

    assert.throw(() => {
      client.init({debug: 'true'});
    }, TypeError);

    assert.throw(() => {
      client.init({resendPacketDelay: '200'});
    }, TypeError);

    assert.throw(() => {
      client.init({resendMaxTimes: '2'});
    }, TypeError);
  });

  test('inits with random source by default', (done) => {
    client.init({
      startDiscovery: false
    }, () => {
      assert.typeOf(client.source, 'string');
      assert.lengthOf(client.source, 8);
      done();
    });
  });

  test('discovery start and stop', (done) => {
    client.init({
      startDiscovery: false
    }, () => {
      assert.isNull(client.discoveryTimer);
      client.startDiscovery();
      assert.isObject(client.discoveryTimer);
      client.stopDiscovery();
      assert.isNull(client.discoveryTimer);
      done();
    });
  });

  test('discovery packet processing', () => {
    const discoveryMessage = {
      size: 41,
      addressable: true,
      tagged: false,
      origin: true,
      protocolVersion: 1024,
      source: '0c583dd9',
      target: 'd073d5006d72',
      site: 'LIFXV2',
      ackRequired: false,
      resRequired: false,
      sequence: 0,
      type: 'stateService',
      service: 'udp',
      port: 56700
    };
    const discoveryInfo = {
      address: '192.168.2.108',
      family: 'IPv4',
      port: 56700,
      size: 41
    };
    let currDeviceCount = getDeviceCount();
    let currMsgQueCnt = getMsgQueueLength();
    client.processDiscoveryPacket(new Error(), null, null);
    client.processDiscoveryPacket(null, {
      service: 'udp',
      port: 8080
    }, null);
    assert.equal(currDeviceCount, getDeviceCount(), 'malformed packages ignored');
    assert.equal(currMsgQueCnt, getMsgQueueLength(), 'malformed packages ignored');

    client.processDiscoveryPacket(null, discoveryMessage, discoveryInfo);
    assert.equal(getDeviceCount(), currDeviceCount + 1, 'device added');
    currDeviceCount += 1;
    assert.equal(getMsgQueueLength(), currMsgQueCnt + 1, 'label request done');
    currMsgQueCnt += 1;

    // Set to offline for recovery check
    client.devices[discoveryInfo.address].status = 'off';
    client.processDiscoveryPacket(null, discoveryMessage, discoveryInfo);
    assert.equal(client.devices[discoveryInfo.address].status, 'on');
    assert.equal(currDeviceCount, getDeviceCount(), 'no new devices but known updated');
    assert.equal(currMsgQueCnt, getMsgQueueLength(), 'no new messages');
  });

  test('finding bulbs by different parameters', () => {
    const bulbs = [];
    let bulb;

    bulb = new Light({
      client: client,
      id: '0dd124d25597',
      address: '192.168.0.8',
      port: constants.LIFX_DEFAULT_PORT,
      seenOnDiscovery: 1
    });
    bulb.status = 'off';
    bulbs.push(bulb);

    bulb = new Light({
      client: client,
      id: 'ad227d95517z',
      address: '192.168.254.254',
      port: constants.LIFX_DEFAULT_PORT,
      seenOnDiscovery: 1
    });
    bulb.label = 'Living room';
    bulbs.push(bulb);

    bulb = new Light({
      client: client,
      id: '783rbc67cg14',
      address: '192.168.1.5',
      port: constants.LIFX_DEFAULT_PORT,
      seenOnDiscovery: 2
    });
    bulb.label = 'Ceiling. Upstairs.';
    bulbs.push(bulb);

    bulb = new Light({
      client: client,
      id: '883rbd67cg15',
      address: 'FE80::903A:1C1A:E802:11E4',
      port: constants.LIFX_DEFAULT_PORT,
      seenOnDiscovery: 2
    });
    bulb.label = 'Front: 🚪Door';
    bulbs.push(bulb);

    client.devices = bulbs;

    let result;
    result = client.light('0dd124d25597');
    assert.instanceOf(result, Light);
    assert.equal(result.address, '192.168.0.8');

    result = client.light('FE80::903A:1C1A:E802:11E4');
    assert.instanceOf(result, Light);
    assert.equal(result.id, '883rbd67cg15');

    result = client.light('192.168.254.254');
    assert.instanceOf(result, Light);
    assert.equal(result.id, 'ad227d95517z');

    result = client.light('Living room');
    assert.instanceOf(result, Light);
    assert.equal(result.id, 'ad227d95517z');

    result = client.light('Front: 🚪Door');
    assert.instanceOf(result, Light);
    assert.equal(result.id, '883rbd67cg15');

    result = client.light('141svsdvsdv1');
    assert.isFalse(result);

    result = client.light('Front: Door');
    assert.isFalse(result, 'don\'t omit utf8');

    result = client.light('living room');
    assert.isFalse(result, 'case sensitive search');

    result = client.light('192.168.0.1');
    assert.isFalse(result);

    result = client.light('7812e9zonvwouv8754179410ufsknsuvsif724581419713947');
    assert.isFalse(result);

    assert.throw(() => {
      client.light({id: '0123456789012'});
    }, TypeError);

    assert.throw(() => {
      client.light(['12a135r25t24']);
    }, TypeError);
  });

  test('adding packages to the sending queue', (done) => {
    client.init({
      startDiscovery: false
    }, () => {
      assert.equal(client.sequenceNumber, 0, 'starts sequence with 0');
      assert.lengthOf(client.messagesQueue, 0, 'is empty');
      client.send(packet.create('getService', {}, '12345678'));
      assert.equal(client.sequenceNumber, 0, 'sequence is the same after broadcast');
      assert.lengthOf(client.messagesQueue, 1, 'added to message queue');
      assert.property(client.messagesQueue[0], 'data', 'has data');
      assert.notProperty(client.messagesQueue[0], 'address', 'broadcast has no target address');

      client.send(packet.create('setPower', {level: 65535, duration: 0, target: 'F37A4311B857'}, '12345678'));
      assert.equal(client.sequenceNumber, 1, 'sequence increased after specific targeting');

      client.sequenceNumber = constants.PACKET_HEADER_SEQUENCE_MAX;
      client.send(packet.create('setPower', {level: 65535, duration: 0, target: 'F37A4311B857'}, '12345678'));
      assert.equal(client.sequenceNumber, 0, 'sequence starts over after maximum');
      done();
    });
  });

  test('getting all known lights', () => {
    const bulbs = [];
    let bulb;

    bulb = new Light({
      client: client,
      id: '0dd124d25597',
      address: '192.168.0.8',
      port: constants.LIFX_DEFAULT_PORT,
      seenOnDiscovery: 1
    });
    bulbs.push(bulb);

    bulb = new Light({
      client: client,
      id: '783rbc67cg14',
      address: '192.168.0.9',
      port: constants.LIFX_DEFAULT_PORT,
      seenOnDiscovery: 1
    });
    bulb.status = 'off';
    bulbs.push(bulb);

    client.devices = bulbs;
    assert.deepEqual(client.lights(''), bulbs);

    assert.deepEqual(client.lights(), [bulbs[0]]);
    assert.deepEqual(client.lights('on'), [bulbs[0]]);

    assert.deepEqual(client.lights('off'), [bulbs[1]]);

    assert.throw(() => {
      client.lights(true);
    }, TypeError);

    assert.throw(() => {
      client.lights('true');
    }, TypeError);
  });

  test('changing debugging mode', () => {
    assert.throw(() => {
      client.setDebug('true');
    }, TypeError);

    assert.equal(client.debug, false, 'debug off by default');

    client.setDebug(true);
    assert.equal(client.debug, true);

    client.setDebug(false);
    assert.equal(client.debug, false);
  });

  suite('message handler', () => {
    beforeEach(() => {
      clock = lolex.install(Date.now());
    });

    afterEach(() => {
      clock.uninstall();
    });

    test('discovery handler registered by default', () => {
      assert.lengthOf(client.messageHandlers, 3);
      assert.equal(client.messageHandlers[0].type, 'stateService');
      assert.equal(client.messageHandlers[1].type, 'stateLabel');
      assert.equal(client.messageHandlers[2].type, 'stateLight');
    });

    test('adding valid handlers', () => {
      const prevMsgHandlerCount = client.messageHandlers.length;
      client.addMessageHandler('stateLight', () => {}, 1);
      assert.lengthOf(client.messageHandlers, prevMsgHandlerCount + 1, 'message handler has been added');
      assert.equal(client.messageHandlers[prevMsgHandlerCount].type, 'stateLight', 'correct handler type');
      assert.equal(client.messageHandlers[prevMsgHandlerCount].timestamp / 1000, Date.now() / 1000, 'timestamp set to now');
    });

    test('adding invalid handlers', () => {
      assert.throw(() => {
        client.addMessageHandler('stateLight', () => {}, '1');
      }, TypeError);
      assert.throw(() => {
        client.addMessageHandler(14, () => {});
      }, TypeError);
      assert.throw(() => {
        client.addMessageHandler('statePower', {});
      }, TypeError);
      assert.throw(() => {
        client.addMessageHandler('unknownPacket', () => {}, 1);
      }, RangeError);
    });

    test('calling and removing one time handlers after call', (done) => {
      let mustBeFalse = false;
      const prevMsgHandlerCount = client.messageHandlers.length;

      client.addMessageHandler('statePower', () => { // random name
        mustBeFalse = true; // Was falsely triggered
      }, 2);
      client.addMessageHandler('stateLight', () => { // random name
        mustBeFalse = true; // Was falsely triggered
      }, 1);
      client.addMessageHandler('statePower', (err, msg, rinfo) => { // same as first name
        assert.isNull(err, 'no error');
        assert.isObject(msg);
        assert.isObject(rinfo);
        assert.lengthOf(client.messageHandlers, prevMsgHandlerCount + 2, 'this handler has been removed');
        assert.equal(mustBeFalse, false, 'incorrect handlers not called');
        done();
      }, 1);
      assert.lengthOf(client.messageHandlers, prevMsgHandlerCount + 3, 'handler has been added');

      // emit a fake message, rinfo is not relevant for fake
      client.processMessageHandlers({
        type: 'statePower',
        sequence: 1,
        source: client.source
      }, {});
    });

    test('keeping permanent handlers after call', (done) => {
      const prevMsgHandlerCount = client.messageHandlers.length;
      client.addMessageHandler('statePower', (err, msg, rinfo) => {
        assert.isNull(err, 'no error');
        assert.isObject(msg);
        assert.isObject(rinfo);
        done(); // Make sure callback is called
      });
      assert.lengthOf(client.messageHandlers, prevMsgHandlerCount + 1, 'handler has been added');

      // emit a fake message, rinfo is not relevant for fake
      client.processMessageHandlers({type: 'statePower', source: client.source}, {});

      assert.lengthOf(client.messageHandlers, prevMsgHandlerCount + 1, 'handler is still present');
    });

    test('calling and removing packets with sequenceNumber, after messageHandlerTimeout', (done) => {
      const prevMsgHandlerCount = client.messageHandlers.length;
      const messageHandlerTimeout = 30000; // Our timeout for the test

      client.init({
        startDiscovery: false,
        messageHandlerTimeout: messageHandlerTimeout
      }, () => {
        client.addMessageHandler('statePower', (err, msg, rinfo) => {
          assert.instanceOf(err, Error, 'error was thrown');
          assert.isNull(msg);
          assert.isNull(rinfo);
          assert.lengthOf(client.messageHandlers, prevMsgHandlerCount, 'handler should be removed after timeout');
          done();
        }, 2);
        assert.lengthOf(client.messageHandlers, prevMsgHandlerCount + 1, 'handler has been added');

        // Instant
        client.processMessageHandlers({type: 'someRandomHandler', source: client.source}, {});
        assert.lengthOf(client.messageHandlers, prevMsgHandlerCount + 1, 'handler should still exist after instant call');

        // Short before messageHandlerTimeout
        clock.setTimeout(() => {
          client.processMessageHandlers({type: 'someRandomHandler', source: client.source}, {});
          assert.lengthOf(client.messageHandlers, prevMsgHandlerCount + 1, 'handler should still exist before timeout');
        }, messageHandlerTimeout - 1);

        // Directly after messageHandlerTimeout
        clock.setTimeout(() => {
          // This will trigger the message handler callback after timeout
          client.processMessageHandlers({type: 'someRandomHandler', source: client.source}, {});
        }, messageHandlerTimeout + 1);

        clock.tick(messageHandlerTimeout - 1);
        clock.tick(messageHandlerTimeout + 1);
      });
    });
  });

  suite('sending process', () => {
    beforeEach(() => {
      clock = lolex.install(Date.now());
    });

    afterEach(() => {
      clock.uninstall();
    });

    test('with no meesages in queue', (done) => {
      const shouldNotBeCalled = () => {
        throw new Error();
      };

      client.init({
        startDiscovery: false
      }, () => {
        client.socket.on('message', shouldNotBeCalled);
        client.sendingProcess();
        assert.isNull(client.sendTimer);
        client.socket.removeListener('message', shouldNotBeCalled);
        done();
      });
    });

    test('with new single one way packet in queue', (done) => {
      const packetSendCallback = (msg, rinfo) => {
        if (msg === undefined || rinfo === undefined) {
          throw new Error();
        }
        done();
      };
      const packetObj = packet.create('setPower', {level: 65535}, client.source);

      client.init({
        startDiscovery: false
      }, () => {
        client.socket.on('message', packetSendCallback);

        let currMsgQueCnt = getMsgQueueLength();
        client.send(packetObj);
        assert.equal(getMsgQueueLength(), currMsgQueCnt + 1, 'sends a packet to the queue');
        currMsgQueCnt += 1;
        assert.isNotNull(client.sendTimer);
        client.stopSendingProcess(); // We don't want automatic calling of sending

        client.sendingProcess(); // Call sending it manualy
        assert.equal(getMsgQueueLength(), currMsgQueCnt - 1, 'removes the packet when send');
        currMsgQueCnt -= 1;
      });
    });

    test('with a new request and response packet in queue', (done) => {
      const packetSendCallback = (msg, rinfo) => {
        if (msg === undefined || rinfo === undefined) {
          throw new Error();
        }
        done();
      };
      const packetObj = packet.create('setPower', {level: 65535}, client.source);

      client.init({
        startDiscovery: false
      }, () => {
        client.socket.on('message', packetSendCallback);

        let currMsgQueCnt = getMsgQueueLength();
        client.send(packetObj, () => {});
        assert.equal(getMsgQueueLength(), currMsgQueCnt + 1, 'sends a packet to the queue');
        currMsgQueCnt += 1;
        assert.isNotNull(client.sendTimer);
        client.stopSendingProcess(); // We don't want automatic calling of sending

        client.sendingProcess(); // Call sending it manualy
        assert.equal(getMsgQueueLength(), currMsgQueCnt, 'keeps packet when send');
      });
    });

    test('with a max retried request and response packet in queue', (done) => {
      const shouldNotBeSendCallback = () => {
        throw new Error();
      };
      const handlerTimeoutCallback = (err, msg, rinfo) => {
        assert.isNotNull(err);
        assert.isNull(msg);
        assert.isNull(rinfo);
        done();
      };
      const packetObj = packet.create('setPower', {level: 65535}, client.source);

      client.init({
        startDiscovery: false
      }, () => {
        client.socket.on('message', shouldNotBeSendCallback);

        let currMsgQueCnt = getMsgQueueLength();
        client.send(packetObj, handlerTimeoutCallback);
        assert.equal(getMsgQueueLength(), currMsgQueCnt + 1, 'sends a packet to the queue');
        currMsgQueCnt += 1;
        assert.isNotNull(client.sendTimer);
        client.stopSendingProcess(); // We don't want automatic calling of sending
        client.messagesQueue[0].timesSent = client.resendMaxTimes; // This triggers error

        client.sendingProcess(); // Call sending it manualy
        assert.equal(getMsgQueueLength(), currMsgQueCnt - 1, 'removes packet after max retries and callback');
        currMsgQueCnt -= 1;
      });
    });
  });
});
