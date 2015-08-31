/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

let testFramework = require('../../../framework');
let assert = require('assert');

let log = testFramework.log;
let timeline = testFramework.timeline;
let camera = testFramework.camera;

suite('test opencv', () => {
  describe('detect car', () => {
    camera.setPreviewFrame('car1.jpg');

    let timestamp = Date.now();
    let rectsExp = [{'x': 26, 'y': 22, 'width': 253, 'height': 126}];
    log.info(`Adding preview frame`);
    timeline.addPreviewFrame(timestamp);

    it('detect car', function(done) {
      timeline.on('car', (when, rects) => {
        assert.equal(timestamp, when, 'car timestamp');
        assert.deepEqual(rects, rectsExp, 'car rects');
        done();
      });
    });
  });
});
