#!/bin/sh

set -ex
adb shell silk /system/node_modules/nodeunit/bin/nodeunit \
  /system/node_modules/movie/test.js
