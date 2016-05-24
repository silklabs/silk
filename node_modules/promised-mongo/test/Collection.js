import {expect} from 'chai';
import Database from '../lib/Database';
import Cursor from '../lib/Cursor';
import {ObjectId} from '../index.js';

require('bluebird').longStackTraces();


describe('Collection', function () {
  let db;
  let collection;

  beforeEach(async function () {
    db = new Database('pmongo_test', {emitError: true});
    await db.dropDatabase();
    collection = db.collection('docs');
  });

  describe('aggregate', function () {
    it('supports $group', async function () {
      await collection.insert([
        { name: 'Squirtle', type: 'water' },
        { name: 'Starmie', type: 'water' },
        { name: 'Charmander', type: 'fire' },
        { name: 'Lapras', type: 'water' }
      ]);

      let result = await collection.aggregate({$group: {_id: '$type'}});
      expect(result).to.deep.have.members([{_id: 'water' }, {_id: 'fire'}]);
    });
  });

  describe('aggregateCursor', function () {
    it('supports $group', async function () {
      await collection.insert([
        { name: 'Squirtle', type: 'water' },
        { name: 'Starmie', type: 'water' },
        { name: 'Charmander', type: 'fire' },
        { name: 'Lapras', type: 'water' }
      ]);

      let cursor = collection.aggregateCursor({$group: {_id: '$type'}});
      expect(cursor).to.be.an.instanceof(Cursor);
      let result = await cursor.toArray();
      expect(result).to.deep.have.members([{_id: 'water' }, {_id: 'fire'}]);
    });
  });

  describe('count', function() {
    it('returns the number of items in the collection', async function() {
      await collection.insert([{number: 1}, {number: 2}, {number: 3}]);
      let result = await collection.count();
      expect(result).to.equal(3);
    });
  });

  describe('createIndex', function () {
    it('adds an index to the system.indexes collection', async function () {
      await collection.createIndex({number: 1});
      let count = await db.collection('system.indexes').count({'key.number': 1});
      expect(count).to.equal(1);
    });

    it('adds an index to the system.indexes collection with the specified full text options', async function () {
      await collection.createIndex({name: 'text', tags: 'text'}, {default_language: 'english', weights: {name: 10, tags: 5}, name: 'testFtIndex'});
      let index = await db.collection('system.indexes').findOne({'name': 'testFtIndex'});
      expect(index.weights).to.deep.equal({name: 10, tags: 5});
    });
  });

  describe('distinct', function () {
    it('returns the distinct values', async function () {
      await collection.insert([{number: 1}, {number: 1}, {number: 2}, {number: 3}]);
      let result = await collection.distinct('number');
      expect(result).to.have.members([1,2,3]);
    });
  });

  describe('drop', function () {
    it('drops the collection and returns true if it exists', async function () {
      await collection.insert([{number: 1}, {number: 2}, {number: 3}]);
      let result = await collection.drop();
      expect(result).to.be.true;
      result = await db.getCollectionNames();
      expect(result).to.not.include.members(['docs']);
    });

    it('returns false if the collection does not exist', async function () {
      let result = await db.collection('notexist').drop();
      expect(result).to.be.false;
    });
  });

  describe('dropIndex', function () {
    it('removes the index the system.indexes collection', async function () {
      await collection.createIndex({number: 1});
      let count = await db.collection('system.indexes').count({'key.number': 1});
      expect(count).to.equal(1);
      await collection.dropIndex('number_1');
      count = await db.collection('system.indexes').count({'key.number': 1});
      expect(count).to.equal(0);
    });
  });

  describe('dropIndexes', function () {
    it('removes the indexes from the system.indexes collection', async function () {
      await collection.createIndex({number: 1});
      let count = await db.collection('system.indexes').count({'key.number': 1});
      expect(count).to.equal(1);
      await collection.dropIndexes();
      count = await db.collection('system.indexes').count({'key.number': 1});
      expect(count).to.equal(0);
    });
  });

  describe('ensureIndex', function () {
    it('adds an index to the system.indexes collection', async function () {
      await collection.ensureIndex({number: 1});
      let count = await db.collection('system.indexes').count({'key.number': 1});
      expect(count).to.equal(1);
    });
  });

  describe('find', function () {
    it('returns all documents', async function () {
      let docs = [{hello: 'world'}, {hello: 'kitty'}];
      await collection.insert(docs);
      let cursor = collection.find();
      expect(cursor).to.be.an.instanceof(Cursor);
      let result = await cursor.toArray();
      expect(result).to.deep.have.members(docs);
    });

    it('returns only the fields specified in the projection', async function () {
      await collection.insert({hello: 'world', another: 'value'});
      let cursor = collection.find({}, {another: 1});
      expect(cursor).to.be.an.instanceof(Cursor);
      let result = await cursor.next();
      expect(result.hello).to.be.undefined;
      expect(result.another).to.equal('value');
    });

    it('assumes the query is for _id if it is an ObjectId', async function () {
      let id = new ObjectId();
      await collection.insert({_id: id, hello: 'world'}, {hello: 'kitty'});
      let results = await collection.find(id);
      expect(results).to.have.length(1);
      expect(results[0].hello).to.equal('world');
    });

    it('assumes the query is for _id if it is not an object', async function () {
      let id = 1;
      await collection.insert({_id: id, hello: 'world'}, {hello: 'kitty'});
      let results = await collection.find(id);
      expect(results).to.have.length(1);
      expect(results[0].hello).to.equal('world');
    });
  });

  describe('findAndModify', function () {
    it('modifies a document and return the old value', async function () {
      await collection.insert([
        { id: 1, hello: 'you' },
        { id: 2, hello: 'other' }
      ]);

      let result = await collection.findAndModify({
        query: { id: 1 },
        update: { $set: { hello: 'world' }}
      });

      expect(result.value.id).to.equal(1);
      expect(result.value.hello).to.equal('you');
      expect(result.lastErrorObject.updatedExisting).to.be.true;
      expect(result.lastErrorObject.n).to.equal(1);
    });

    it('modifies a document and return the new value', async function () {
      await collection.insert([
        { id: 1, hello: 'you' },
        { id: 2, hello: 'other' }
      ]);

      let result = await collection.findAndModify({
        query: { id: 2 },
        'new': true,
        update: { $set: { hello: 'me' }}
      });

      expect(result.value.id).to.equal(2);
      expect(result.value.hello).to.equal('me');
      expect(result.lastErrorObject.updatedExisting).to.be.true;
      expect(result.lastErrorObject.n).to.equal(1);
    });

    it('removes a document and return the old value', async function () {
      await collection.insert([
        { id: 1, hello: 'you' },
        { id: 2, hello: 'other' }
      ]);

      let result = await collection.findAndModify({
        query: { id: 1 },
        remove: true
      });

      expect(result.value.id).to.equal(1);
      expect(result.value.hello).to.equal('you');
      expect(result.lastErrorObject.n).to.equal(1);

      // check for removal
      let count = await collection.count({id: 1});
      expect(count).to.be.equal(0);
    });

    it('inserts a document using upsert', async function () {
      await collection.insert([
        { id: 1, hello: 'you' },
        { id: 2, hello: 'other' }
      ]);

      let result = await collection.findAndModify({
        query: { id: 3 },
        update: { id: 3, hello: 'girl' },
        'new': true,
        upsert: true
      });

      expect(result.value.id).to.equal(3);
      expect(result.value.hello).to.equal('girl');
      expect(result.lastErrorObject.updatedExisting).to.be.false;
      expect(result.lastErrorObject.n).to.equal(1);
      expect(result.lastErrorObject.upserted.toString()).to.equal(result.value._id.toString())
    });

    it('does nothing for a non-existent document', async function () {
      await collection.insert([
        { id: 1, hello: 'you' },
        { id: 2, hello: 'other' }
      ]);

      let result = await collection.findAndModify({
        query: { id: 0 },
        update: { $set: { hello: 'boy' }}
      });

      expect(result.lastErrorObject.n).to.equal(0);
    });
  });

  describe('findOne', function () {
    it('returns a single document', async function () {
      await collection.insert([
        { id: 1, hello: 'you' },
        { id: 2, hello: 'other' }
      ]);

      let result = await collection.findOne();
      expect(result.id).to.equal(1);
      expect(result.hello).to.equal('you');
    });

    it('assumes the query is for _id if it is an ObjectId', async function () {
      let id = new ObjectId();
      await collection.insert({_id: id, hello: 'world'}, {hello: 'kitty'});
      let result = await collection.findOne(id);
      expect(result.hello).to.equal('world');
    });

    it('assumes the query is for _id if it is not an object', async function () {
      let id = 1;
      await collection.insert({_id: id, hello: 'world'}, {hello: 'kitty'});
      let result = await collection.findOne(id);
      expect(result.hello).to.equal('world');
    });
  });

  describe('getIndexes', function () {
    it('returns a list of indexes', async function () {
      await collection.createIndex({number: 1});
      let result = await collection.getIndexes();
      expect(result.length).to.equal(2); // include _id index
    });
  });

  describe('group', function () {
    it('runs reduce and finalize functions', async function () {
      await collection.insert([
        { n: 3, online: 1 },
        { n: 2, online: 2 },
        { n: 2, online: 1 },
        { n: 4, online: 3 },
        { n: 5, online: 3 },
        { n: 6, online: 5 },
      ]);

      let result = await collection.group({
        key: {},
        cond: {n: {$lt: 5}},
        initial: {count: 0, online: 0},
        reduce: function (doc, out) {
          out.count += doc.n;
          out.online += doc.online;
        },
        finalize: function (out) {
          out.avgOnline = out.online / out.count;
        }
      });

      expect(result.length).to.equal(1);
      expect(result[0].count).to.equal(11);
      expect(result[0].online).to.equal(7);
      expect(result[0].avgOnline).to.equal(7/11);
    });
  });

  describe('insert', function () {
    it('stores a single document in the database', async function () {
      let doc = {
        hello: 'world'
      };

      await collection.insert(doc);

      let result = await collection.find();
      expect(result).to.deep.have.members([doc]);
    });

    it('stores a multiple documents in the database', async function () {
      let docs = [
        {name: 'fred'},
        {name: 'barney'}
      ];

      await collection.insert(docs);

      let result = await collection.find();
      expect(result).to.deep.have.members(docs);
    });

    it('throws an exception for an index violation', async function () {
      // issue #24
      await collection.createIndex({email: 1}, {unique: true});
      await collection.insert({email: 'foo@test.co.uk'});

      try {
        await collection.insert({email: 'foo@test.co.uk'});
        expect(false).to.be.ok;
      } catch (e) {
        expect(e.code).to.equal(11000);
        expect(e).to.be.an.instanceof(Error);
      }
    });
  });

  describe('isCapped', function () {
    it('returns true for a capped collection', async function () {
      await db.createCollection('cappedCollection', {capped: true, size: 1024});
      let result = await db.collection('cappedCollection').isCapped();
      expect(result).to.be.true;
    });

    it('returns false for a non-capped collection', async function () {
      await db.createCollection('uncappedCollection', {capped: false});
      let result = await db.collection('uncappedCollection').isCapped();
      expect(result).to.be.false;
    });
  });

  describe('mapReduce', function () {
    it('produces the expected results', async function () {
      await collection.insert([
        { name: 'Squirtle', type: 'water', level: 10 },
        { name: 'Starmie', type: 'water', level: 8 },
        { name: 'Charmander', type: 'fire', level: 8 },
        { name: 'Lapras', type: 'water', level: 12 }
      ]);

      let result = await collection.mapReduce(
        function () {
          emit(this.type, this.level);
        },
        function (key, values) {
          return Array.sum(values);
        },
        {
          query: { type: 'water' },
          out: { inline: 1 }
        }
      );

      expect(result.results.length).to.equal(1);
      expect(result.results[0]._id).to.equal('water');
      expect(result.results[0].value).to.equal(30);
    });
  });

  describe('reIndex', function () {
    it('succeeds', async function () {
      // make sure the collection exists
      await collection.insert({hello: 'world'});
      await collection.reIndex();
    });
  });

  describe('remove', function () {
    it('removes only one document if justOne is set', async function () {
      await collection.insert([
        { name: 'Squirtle', type: 'water', level: 10 },
        { name: 'Starmie', type: 'water', level: 8 },
        { name: 'Charmander', type: 'fire', level: 8 },
        { name: 'Lapras', type: 'water', level: 12 }
      ]);

      let result = await collection.remove({type: 'water'}, true);
      expect(result.n).to.equal(1);

      result = await collection.find({type: 'water'});
      expect(result.length).to.equal(2);
    });

    it('removes all matching documents', async function () {
      await collection.insert([
        { name: 'Squirtle', type: 'water', level: 10 },
        { name: 'Starmie', type: 'water', level: 8 },
        { name: 'Charmander', type: 'fire', level: 8 },
        { name: 'Lapras', type: 'water', level: 12 }
      ]);

      let result = await collection.remove({type: 'water'});
      expect(result.n).to.equal(3);

      result = await collection.find({type: 'water'});
      expect(result.length).to.equal(0);
    });

    it('assumes the query is for _id if it is an ObjectId', async function () {
      let id = new ObjectId();
      await collection.insert({_id: id, hello: 'world'});
      await collection.remove(id);
      expect(await collection.findOne(id)).to.not.exist;
    });

    it('assumes the query is for _id if it is not an object', async function () {
      let id = 1;
      await collection.insert({_id: id, hello: 'world'});
      await collection.remove(id);
      expect(await collection.findOne(id)).to.not.exist;
    });
  });

  describe('save', function () {
    it('adds a new document to the collection', async function () {
      let doc = await collection.save({ name: 'barney' });
      expect(doc._id).to.exist;

      let cmp = await collection.findOne({_id: doc._id});
      expect(cmp).to.deep.equal(doc);
    });

    it('updates an existing document in the collection', async function () {
      let doc = await collection.save({ name: 'barney' });
      expect(doc._id).to.exist;

      doc.name = 'fred';
      await collection.save(doc);

      let cmp = await collection.find();
      expect(cmp).to.deep.have.members([doc]);
    });
  });


  describe('update', function () {
    it('sets a field to a different value', async function () {
      await collection.insert({hello: 'world'});

      let result = await collection.update({hello: 'world'}, {$set: {hello: 'verden'}});
      expect(result.n).to.equal(1);

      let cmp = await collection.findOne();
      expect(cmp.hello).to.equal('verden');
    });

    it('updates multiple documents if multi is set', async function () {
      await collection.insert([
        {hello: 'world1'},
        {hello: 'world2'}
      ]);

      let result = await collection.update({}, {$set: {updated: true}}, {multi: true});
      expect(result.n).to.equal(2);

      let cmp = await collection.find({updated: true});
      expect(cmp.length).to.equal(2);
    });

    it('assumes the query is for _id if it is an ObjectId', async function () {
      let id = new ObjectId();
      await collection.insert({_id: id, hello: 'world'});
      await collection.update(id, {$set: {hello: 'kitty'}});
      let result = await collection.findOne(id);
      expect(result.hello).to.equal('kitty');
    });

    it('assumes the query is for _id if it is not an object', async function () {
      let id = 1;
      await collection.insert({_id: id, hello: 'world'});
      await collection.update(id, {$set: {hello: 'kitty'}});
      let result = await collection.findOne(id);
      expect(result.hello).to.equal('kitty');
    });

    it('throws an exception for an index violation', async function () {
      // issue #24
      await collection.createIndex({email: 1}, {unique: true});
      await collection.insert({email: 'foo@test.co.uk'});
      await collection.insert({email: 'bar@test.co.uk'});

      try {
        await collection.update({email: 'foo@test.co.uk'}, {email: 'bar@test.co.uk'});
        expect(false).to.be.ok;
      } catch (e) {
        expect(e.code).to.equal(11000);
        expect(e).to.be.an.instanceof(Error);
      }
    });
  });
});
