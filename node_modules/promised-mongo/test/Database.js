import {expect} from 'chai';
import Database from '../lib/Database';

require('bluebird').longStackTraces();


describe('Database', function () {
  let db;

  beforeEach(async function () {
    db = new Database('pmongo_test');
    await db.dropDatabase();
    // this is required because the users are stored in the admin db
    await db.runCommand('dropAllUsersFromDatabase');
  });

  describe('addUser', function() {
    it('succeeds', async function () {
      await db.createUser({
        user: 'fred',
        pwd: 'password',
        roles: []
      });
    });
  });

  describe('collection', function () {
    it('returns a Collection object', function () {
      let result = db.collection('foo');
      expect(result).to.be.not.null;
      expect(result.collectionName).to.equal('foo');
      expect(result.fullCollectionName).to.equal('pmongo_test.foo');
    });
  });

  describe('createCollection', function() {
    it('creates the collection', async function () {
      await db.createCollection('foo');
      let result = await db.getCollectionNames();
      expect(result).to.include.members(['foo']);
    });
  });

  describe('createUser', function() {
    it('succeeds', async function () {
      await db.createUser({
        user: 'fred',
        pwd: 'password',
        roles: []
      });
    });
  });

  describe('dropDatabase', function() {
    it('succeeds', async function () {
      await db.dropDatabase();
    });
  });

  describe('dropUser', function() {
    ('succeeds', async function () {
      await db.createUser({
        user: 'fred',
        pwd: 'password',
        roles: []
      });
      await db.dropUser('fred');
    });
  });

  describe('getCollectionNames', function() {
    it('succeeds', async function () {
      await db.createCollection('foo');
      var collections = await db.getCollectionNames();
      expect(collections).to.include.members(['foo']);
    });
  });

  describe('getLastError', function() {
    it('succeeds', async function () {
      await db.getLastError();
    });
  });

  describe('getLastErrorObj', function() {
    it('succeeds', async function () {
      await db.getLastErrorObj();
    });
  });

  describe('removeUser', function() {
    it('succeed', async function () {
      await db.createUser({
        user: 'fred',
        pwd: 'password',
        roles: []
      });
      await db.removeUser('fred');
    });
  });

  describe('stats', function() {
    it('succeeds', async function () {
      await db.stats();
    });
  });

  describe('getSiblingDb', function () {
    it('succeeds', async function () {
      let db2 = await db.getSiblingDb('test');
      expect(db2).to.exist;
      expect(db2._serverPromise).to.exist;
      expect(db2.config.dbName).to.equal('test');
    });
  });
});
