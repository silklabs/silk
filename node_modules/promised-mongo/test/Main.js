

import {expect} from 'chai';
import pmongo from '../index.js';

require('bluebird').longStackTraces();


describe('Main', function () {

  describe('Proxy', function () {
    it('defers unknown property accesses to the collection() function', function () {
      let called = false;
      let db = pmongo('pmongo_test');

      // duck punch collection to assert that it is called
      db.collection = function (name) {
        called = name;
      };

      db.myCollection;
      expect(called).to.equal('myCollection');
    });
  });
});
