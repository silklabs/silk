/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

let battery = require('battery');
let log = require('log')('TestFramework');
let timeline = require('timeline');

class TestFramework {
  constructor() {
    log.verbose('TestFramework constructor');
    this.battery = battery;
    this.log = log;
    this.timeline = timeline;
  }
}

var testFramework = new TestFramework();
module.exports = testFramework;
