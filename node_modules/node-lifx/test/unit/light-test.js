'use strict';

var Lifx = require('../../').Client;
var Light = require('../../').Light;
var constant = require('../../').constants;
var assert = require('chai').assert;

suite('Light', () => {
  let client;
  let bulb;
  const getMsgQueueLength = () => {
    return client.messagesQueue.length;
  };
  const getMsgHandlerLength = () => {
    return client.messageHandlers.length;
  };

  beforeEach(() => {
    client = new Lifx();
    bulb = new Light({
      client: client,
      id: 'F37A4311B857',
      address: '192.168.0.1',
      port: constant.LIFX_DEFAULT_PORT,
      seenOnDiscovery: 0
    });
  });

  afterEach(() => {
    client.destroy();
  });

  test('light status \'on\' after instanciation', () => {
    assert.equal(bulb.status, 'on');
  });

  test('turning a light on', () => {
    let currMsgQueCnt = getMsgQueueLength();
    let currHandlerCnt = getMsgHandlerLength();
    bulb.on();
    assert.equal(getMsgQueueLength(), currMsgQueCnt + 1, 'sends a packet to the queue');
    currMsgQueCnt += 1;

    bulb.on(200);
    assert.equal(getMsgQueueLength(), currMsgQueCnt + 1, 'sends a packet to the queue');
    currMsgQueCnt += 1;

    assert.throw(() => {
      bulb.on('200');
    }, RangeError);
    assert.equal(getMsgQueueLength(), currMsgQueCnt, 'no package added to the queue');

    assert.throw(() => {
      bulb.on(200, []);
    }, TypeError);
    assert.equal(getMsgQueueLength(), currMsgQueCnt, 'no package added to the queue');
    assert.equal(getMsgHandlerLength(), currHandlerCnt, 'no handler added');

    bulb.on(0, () => {});
    assert.equal(getMsgQueueLength(), currMsgQueCnt + 1, 'sends a packet to the queue');
    currMsgQueCnt += 1;
    assert.equal(getMsgHandlerLength(), currHandlerCnt + 1, 'adds a handler');
    currHandlerCnt += 1;
  });

  test('turning a light off', () => {
    let currMsgQueCnt = getMsgQueueLength();
    let currHandlerCnt = getMsgHandlerLength();

    bulb.off();
    assert.equal(getMsgQueueLength(), currMsgQueCnt + 1, 'sends a packet to the queue');
    currMsgQueCnt += 1;

    bulb.off(200);
    assert.equal(getMsgQueueLength(), currMsgQueCnt + 1, 'sends a packet to the queue');
    currMsgQueCnt += 1;

    assert.throw(() => {
      bulb.off('200');
    }, RangeError);
    assert.equal(getMsgQueueLength(), currMsgQueCnt, 'no package added to the queue');

    assert.throw(() => {
      bulb.off(200, []);
    }, TypeError);
    assert.equal(getMsgQueueLength(), currMsgQueCnt, 'no package added to the queue');
    assert.equal(getMsgHandlerLength(), currHandlerCnt, 'no handler added');

    bulb.off(0, () => {});
    assert.equal(getMsgQueueLength(), currMsgQueCnt + 1, 'sends a packet to the queue');
    currMsgQueCnt += 1;
    assert.equal(getMsgHandlerLength(), currHandlerCnt + 1, 'adds a handler');
    currHandlerCnt += 1;
  });

  test('changing the color of a light', () => {
    let currMsgQueCnt = getMsgQueueLength();
    let currHandlerCnt = getMsgHandlerLength();

    // Error cases
    assert.throw(() => {
      // No arguments
      bulb.color();
    }, RangeError);

    assert.throw(() => {
      // To min arguments
      bulb.color(constant.HSBK_MINIMUM_HUE);
    }, RangeError);

    assert.throw(() => {
      // To min arguments
      bulb.color(constant.HSBK_MINIMUM_HUE, constant.HSBK_MINIMUM_SATURATION);
    }, RangeError);

    assert.throw(() => {
      // Saturation to low
      bulb.color(constant.HSBK_MINIMUM_HUE, constant.HSBK_MINIMUM_SATURATION - 1, constant.HSBK_MINIMUM_BRIGHTNESS);
    }, RangeError);

    assert.throw(() => {
      // Saturation to high
      bulb.color(constant.HSBK_MINIMUM_HUE, constant.HSBK_MAXIMUM_SATURATION + 1, constant.HSBK_MINIMUM_BRIGHTNESS);
    }, RangeError);

    assert.throw(() => {
      // Hue to low
      bulb.color(constant.HSBK_MINIMUM_HUE - 1, constant.HSBK_MINIMUM_SATURATION, constant.HSBK_MINIMUM_BRIGHTNESS);
    }, RangeError);

    assert.throw(() => {
      // Hue to high
      bulb.color(constant.HSBK_MAXIMUM_HUE + 1, constant.HSBK_MINIMUM_SATURATION, constant.HSBK_MINIMUM_BRIGHTNESS);
    }, RangeError);

    assert.throw(() => {
      // Brightness to low
      bulb.color(constant.HSBK_MINIMUM_HUE, constant.HSBK_MINIMUM_SATURATION, constant.HSBK_MINIMUM_BRIGHTNESS - 1);
    }, RangeError);

    assert.throw(() => {
      // Brightness to high
      bulb.color(constant.HSBK_MINIMUM_HUE, constant.HSBK_MINIMUM_SATURATION, constant.HSBK_MAXIMUM_BRIGHTNESS + 1);
    }, RangeError);

    assert.throw(() => {
      // Kelvin to high
      bulb.color(constant.HSBK_MINIMUM_HUE, constant.HSBK_MINIMUM_SATURATION, constant.HSBK_MAXIMUM_BRIGHTNESS, constant.HSBK_MAXIMUM_KELVIN + 1);
    }, RangeError);

    assert.throw(() => {
      // Invalid duration
      bulb.color(constant.HSBK_MINIMUM_HUE, constant.HSBK_MAXIMUM_SATURATION, constant.HSBK_MINIMUM_BRIGHTNESS, constant.HSBK_MAXIMUM_KELVIN, '100');
    }, RangeError);

    assert.throw(() => {
      // Invalid callback
      bulb.color(constant.HSBK_MINIMUM_HUE, constant.HSBK_MAXIMUM_SATURATION, constant.HSBK_MINIMUM_BRIGHTNESS, constant.HSBK_MAXIMUM_KELVIN, 100, []);
    }, TypeError);
    assert.equal(getMsgQueueLength(), currMsgQueCnt, 'no package added to the queue');

    bulb.color(constant.HSBK_MAXIMUM_HUE, constant.HSBK_MINIMUM_SATURATION, constant.HSBK_MAXIMUM_BRIGHTNESS);
    assert.equal(getMsgQueueLength(), currMsgQueCnt + 1, 'package added to the queue');
    currMsgQueCnt += 1;

    bulb.color(constant.HSBK_MINIMUM_HUE, constant.HSBK_MAXIMUM_SATURATION, constant.HSBK_MINIMUM_BRIGHTNESS, constant.HSBK_MINIMUM_KELVIN);
    assert.equal(getMsgQueueLength(), currMsgQueCnt + 1, 'package added to the queue');
    currMsgQueCnt += 1;

    bulb.color(constant.HSBK_MINIMUM_HUE, constant.HSBK_MAXIMUM_SATURATION, constant.HSBK_MINIMUM_BRIGHTNESS, constant.HSBK_MINIMUM_KELVIN, 200);
    assert.equal(getMsgQueueLength(), currMsgQueCnt + 1, 'package added to the queue');
    currMsgQueCnt += 1;
    assert.equal(getMsgHandlerLength(), currHandlerCnt, 'no handler added');

    bulb.color(constant.HSBK_MINIMUM_BRIGHTNESS, constant.HSBK_MAXIMUM_SATURATION, constant.HSBK_MINIMUM_BRIGHTNESS, constant.HSBK_MINIMUM_KELVIN, 100, () => {});
    assert.equal(getMsgQueueLength(), currMsgQueCnt + 1, 'package added to the queue');
    currMsgQueCnt += 1;
    assert.equal(getMsgHandlerLength(), currHandlerCnt + 1, 'adds a handler');
    currHandlerCnt += 1;
  });

  test('getting light summary', () => {
    assert.throw(() => {
      bulb.getState('test');
    }, TypeError);

    let currHandlerCnt = getMsgHandlerLength();
    bulb.getState(() => {});
    assert.equal(getMsgHandlerLength(), currHandlerCnt + 1, 'adds a handler');
    currHandlerCnt += 1;
  });

  test('getting hardware', () => {
    assert.throw(() => {
      bulb.getHardwareVersion('test');
    }, TypeError);

    let currHandlerCnt = getMsgHandlerLength();
    bulb.getHardwareVersion(() => {});
    assert.equal(getMsgHandlerLength(), currHandlerCnt + 1, 'adds a handler');
    currHandlerCnt += 1;
  });

  test('getting firmware version', () => {
    assert.throw(() => {
      bulb.getFirmwareVersion('test');
    }, TypeError);

    let currHandlerCnt = getMsgHandlerLength();
    bulb.getFirmwareVersion(() => {});
    assert.equal(getMsgHandlerLength(), currHandlerCnt + 1, 'adds a handler');
    currHandlerCnt += 1;
  });

  test('getting firmware info', () => {
    assert.throw(() => {
      bulb.getFirmwareInfo('test');
    }, TypeError);

    let currHandlerCnt = getMsgHandlerLength();
    bulb.getFirmwareInfo(() => {});
    assert.equal(getMsgHandlerLength(), currHandlerCnt + 1, 'adds a handler');
    currHandlerCnt += 1;
  });

  test('getting wifi info', () => {
    assert.throw(() => {
      bulb.getWifiInfo('test');
    }, TypeError);

    let currHandlerCnt = getMsgHandlerLength();
    bulb.getWifiInfo(() => {});
    assert.equal(getMsgHandlerLength(), currHandlerCnt + 1, 'adds a handler');
    currHandlerCnt += 1;
  });

  test('getting wifi version', () => {
    assert.throw(() => {
      bulb.getWifiVersion('test');
    }, TypeError);

    let currHandlerCnt = getMsgHandlerLength();
    bulb.getWifiVersion(() => {});
    assert.equal(getMsgHandlerLength(), currHandlerCnt + 1, 'adds a handler');
    currHandlerCnt += 1;
  });

  test('getting the label', (done) => {
    assert.throw(() => {
      bulb.getLabel('test');
    }, TypeError, 'expects callback to be a function');

    assert.throw(() => {
      bulb.getLabel(() => {}, 'true');
    }, TypeError, 'expects cache to be a boolean');

    let currHandlerCnt = getMsgHandlerLength();
    bulb.getLabel(() => {});
    assert.equal(getMsgHandlerLength(), currHandlerCnt + 1, 'adds a handler');
    currHandlerCnt += 1;

    bulb.getLabel(() => {}, true);
    assert.equal(getMsgHandlerLength(), currHandlerCnt + 1, 'adds a handler if no cache availible');
    currHandlerCnt += 1;

    bulb.label = 'test';
    bulb.getLabel((err, label) => {
      if (err) {
        return;
      }
      assert.equal(label, 'test');
      done();
    }, true);
    assert.equal(getMsgHandlerLength(), currHandlerCnt, 'does not add a handler if cache availible');
  });

  test('setting the label', () => {
    let currMsgQueCnt = getMsgQueueLength();
    let currHandlerCnt = getMsgHandlerLength();
    assert.throw(() => {
      bulb.setLabel(15);
    }, TypeError);

    assert.throw(() => {
      bulb.setLabel();
    }, TypeError);

    assert.throw(() => {
      bulb.setLabel('Test', []);
    }, TypeError);

    assert.throw(() => {
      bulb.setLabel('');
    }, RangeError, 'minimum of one char');

    assert.throw(() => {
      bulb.setLabel('123456789012345678901234567890123'); // 33 chars
    }, RangeError, 'maximum of 32 bytes');

    assert.throw(() => {
      bulb.setLabel('1234567890123456789012345678901💩'); // 32 chars but one 2 byte
    }, RangeError, 'maximum of 32 bytes');
    assert.equal(getMsgQueueLength(), currMsgQueCnt, 'no packet added to the queue');

    bulb.setLabel('12345678901234567890123456789012');
    assert.equal(getMsgQueueLength(), currMsgQueCnt + 1, 'sends a packet to the queue');
    currMsgQueCnt += 1;
    assert.equal(getMsgHandlerLength(), currHandlerCnt, 'no handler added');

    bulb.setLabel('12345678901234567890123456789012', () => {});
    assert.equal(getMsgQueueLength(), currMsgQueCnt + 1, 'sends a packet to the queue');
    currMsgQueCnt += 1;
    assert.equal(getMsgHandlerLength(), currHandlerCnt + 1, 'adds a handler');
    currHandlerCnt += 1;
  });

  test('getting ambient light', () => {
    assert.throw(() => {
      bulb.getAmbientLight('someValue');
    }, TypeError);

    let currHandlerCnt = getMsgHandlerLength();
    bulb.getAmbientLight(() => {});
    assert.equal(getMsgHandlerLength(), currHandlerCnt + 1, 'adds a handler');
    currHandlerCnt += 1;
  });

  test('getting power', () => {
    assert.throw(() => {
      bulb.getPower('someValue');
    }, TypeError);

    let currHandlerCnt = getMsgHandlerLength();
    bulb.getPower(() => {});
    assert.equal(getMsgHandlerLength(), currHandlerCnt + 1, 'adds a handler');
    currHandlerCnt += 1;
  });
});
