

import {expect} from 'chai';
import Database from '../lib/Database';

require('bluebird').longStackTraces();


describe('Database-connect', function () {
  describe('connect', function () {
    it('succeeds', async function() {
      let db = new Database('pmongo_test');
      let result = await db.connect();
      expect(result).to.be.not.null;
    });

    it('throws an error on invalid domain', async function() {
      let db = new Database('mongodb://invaliddomain/', {emitError: true, reconnect: false});
      try {
        await db.connect();
        throw new Error("shouldn't get here");
      } catch (e) {
        expect(e.message).to.contain('getaddrinfo ENOTFOUND invaliddomain');
      }
    });

    it('throws an error on timeout', async function() {
      let db = new Database('mongodb://10.255.255.1/pmongo_test', {emitError: true, reconnect: false, connectionTimeout: 1});

      try {
        await db.connect();
        throw new Error("shouldn't get here");
      } catch (e) {
        expect(e.name).to.equal('MongoError');
        expect(e.message).to.contain('timed out');
      }
    });
  });
});
