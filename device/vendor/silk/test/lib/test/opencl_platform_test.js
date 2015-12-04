/**
 * Copyright (c) 2015 Silk Labs, Inc. All Rights Reserved. Confidential and
 * Proprietary - Silk Labs, Inc.
 */

let testFramework = require('../../framework')('opencl_platform_test');
let should = require('chai').should();
let assert = require('chai').assert;
let log = testFramework.log;
let fs = require('mz/fs');

suite('test opencl', () => {
  test('Check if opencl is present', async () => {
    if (await fs.exists(`/system/vendor/lib/libOpenCL.so`)) {
      log.info(`Found opencl library; running test`);
      runTests();
    } else {
      log.info(`Error loading opencl; skipping test`);
      assert(true);
    }
  });
});

function runTests() {
  let cl = require('opencl');
  suite('Platform', () => {
    suite('#getPlatformIDs()', () => {
      test('should return an array', () => {
        let devices = cl.getPlatformIDs();
        should.exist(devices);
        assert.isArray(devices);
        assert.isAbove(devices.length, 0);
      });
    });

    function testString(platform, name) {
      test(name + ' should return a string', () => {
        let val = cl.getPlatformInfo(platform, eval('cl.' + name));
        assert.isString(val);
        log.info(name + ' = ' + val);
      });
    }

    function testPlatform(p) {
      suite('#getPlatformInfo() for ' + cl.getPlatformInfo(p, cl.PLATFORM_VENDOR) + ' ' + cl.getPlatformInfo(p, cl.PLATFORM_NAME), () => {
        testString(p, 'PLATFORM_VERSION');
        testString(p, 'PLATFORM_PROFILE');
        testString(p, 'PLATFORM_NAME');
        testString(p, 'PLATFORM_VENDOR');
        testString(p, 'PLATFORM_EXTENSIONS');

        // Negative test cases
        test('should throw cl.INVALID_VALUE with name = cl.DEVICE_TYPE_CPU', () => {
          cl.getPlatformInfo.bind(cl.getPlatformInfo, p, cl.DEVICE_TYPE_CPU).should.throw(cl.INVALID_VALUE.message);
        });
        test('should throw cl.INVALID_VALUE with name = 0x2000', () => {
          cl.getPlatformInfo.bind(cl.getPlatformInfo, p, 0x2000).should.throw(cl.INVALID_VALUE.message);
        });
        test('should throw cl.INVALID_VALUE with name = "a string"',() => {
          cl.getPlatformInfo.bind(cl.getPlatformInfo, p, 'a string').should.throw(cl.INVALID_VALUE.message);
        });
        test('should throw cl.INVALID_VALUE with name = -123.56',() => {
          cl.getPlatformInfo.bind(cl.getPlatformInfo, p ,-123.56).should.throw(cl.INVALID_VALUE.message);
        });
        test('should throw cl.INVALID_PLATFORM with platform = null',() => {
          cl.getPlatformInfo.bind(cl.getPlatformInfo, null, 123).should.throw(cl.INVALID_PLATFORM.message);
        });
        test('should throw cl.INVALID_PLATFORM with platform = "a string"',() => {
          cl.getPlatformInfo.bind(cl.getPlatformInfo, 'a string', 123).should.throw(cl.INVALID_PLATFORM.message);
        });
        test('should throw cl.INVALID_PLATFORM with platform = 123',() => {
          cl.getPlatformInfo.bind(cl.getPlatformInfo, 123, 123).should.throw(cl.INVALID_PLATFORM.message);
        });
        test('should throw cl.INVALID_PLATFORM with platform = [1,2,3]',() => {
          cl.getPlatformInfo.bind(cl.getPlatformInfo, [1, 2, 3], 123).should.throw(cl.INVALID_PLATFORM.message);
        });
        test('should throw cl.INVALID_PLATFORM with platform = new Array()',() => {
          cl.getPlatformInfo.bind(cl.getPlatformInfo, [], 123).should.throw(cl.INVALID_PLATFORM.message);
        });
      });
    }

    let platforms = cl.getPlatformIDs();
    for (let i = 0; i < platforms.length; i++) {
      testPlatform(platforms[i]);
    }
  });
}
