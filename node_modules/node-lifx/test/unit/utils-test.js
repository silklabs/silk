'use strict';

var utils = require('../../').utils;
var assert = require('chai').assert;

suite('Utils', () => {
  test('create a random hex string', () => {
    const test1 = utils.getRandomHexString();
    assert.isString(test1);
    assert.equal(test1, test1.match(/^[0-9A-F]{8}$/)[0]);

    const test2 = utils.getRandomHexString(16);
    assert.isString(test2);
    assert.equal(test2, test2.match(/^[0-9A-F]{16}$/)[0]);
  });

  test('getting host ips', () => {
    const hostIPs = utils.getHostIPs();
    assert.isArray(hostIPs);
    hostIPs.forEach((ip) => {
      assert.isString(ip, 'IPs are given as');
      assert.isTrue(ip.indexOf('.') >= 0 || ip.indexOf(':') >= 0, 'IP format');
    });
  });
});
