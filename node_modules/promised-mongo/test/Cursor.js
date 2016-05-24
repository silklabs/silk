import {expect} from 'chai';
import Database from '../lib/Database';
import Cursor from '../lib/Cursor';

require('bluebird').longStackTraces();


describe('Cursor', function () {
  let db, collection;

  beforeEach(async function () {
    db = new Database('pmongo_test');
    await db.dropDatabase();
    collection = db.collection('docs');
  });

  describe('count', function () {
    it('returns the correct total count', async function () {
      await collection.insert([
          { name: 'Squirtle', type: 'water' },
          { name: 'Starmie', type: 'water' },
          { name: 'Charmander', type: 'fire' },
          { name: 'Lapras', type: 'water' }
      ]);

      let result = await collection.find().count();
      expect(result).to.equal(4);
    });

    it('returns the correct filtered count', async function () {
      await collection.insert([
          { name: 'Squirtle', type: 'water' },
          { name: 'Starmie', type: 'water' },
          { name: 'Charmander', type: 'fire' },
          { name: 'Lapras', type: 'water' }
      ]);

      let result = await collection.find({type: 'water'}).count();
      expect(result).to.equal(3);
    });
  });

  describe('explain', function() {
    it('returns the expected values', async function () {
      await collection.insert([
          { name: 'Squirtle', type: 'water' },
          { name: 'Starmie', type: 'water' },
          { name: 'Charmander', type: 'fire' },
          { name: 'Lapras', type: 'water' }
      ]);

      let result = await collection.find().explain();

      if (result.executionStats) {
        expect(result.executionStats.totalDocsExamined).to.equal(4);
      } else {
        expect(result.nscannedObjects).to.equal(4);
      }
    });
  });

  describe('forEach', function () {
    it('executes the function for each value', async function () {
      let docs = [
          { name: 'Squirtle', type: 'water' },
          { name: 'Starmie', type: 'water' },
          { name: 'Charmander', type: 'fire' },
          { name: 'Lapras', type: 'water' }
      ];

      let touched = [];

      await collection.insert(docs);
      await collection.find().forEach(function (doc) {
        delete doc._id; // so compare works
        touched.push(doc);
      });

      expect(touched).to.deep.have.members(touched);
    });
  });

  describe('limit', function () {
    it('limits the number of results', async function () {
      await collection.insert([
          { name: 'Squirtle', type: 'water' },
          { name: 'Starmie', type: 'water' },
          { name: 'Charmander', type: 'fire' },
          { name: 'Lapras', type: 'water' }
      ]);

      let result = await collection.find().limit(2);

      expect(result.length).to.equal(2);
    });
  });

  describe('map', function () {
    it('maps each value', async function () {
      await collection.insert([
        { hello: 'barney' },
        { hello: 'fred' }
      ]);

      let result = await collection.find().map(function (x) {
        return x.hello;
      });

      expect(result).to.have.members(['fred', 'barney']);
    });
  });

  describe('next', function () {
    it('returns the next value', async function () {
      await collection.insert([
        { hello: 'barney' },
        { hello: 'fred' }
      ]);

      let result = await collection.find().next();

      expect(result.hello).to.equal('barney');
    });
  });

  describe('rewind', function () {
    it('resets the cursor position', async function () {
      await collection.insert([
          { name: 'Squirtle', type: 'water' },
          { name: 'Starmie', type: 'water' },
          { name: 'Charmander', type: 'fire' },
          { name: 'Lapras', type: 'water' }
      ]);

      let cursor = collection.find().sort({name: 1});

      let result = await cursor.next();
      expect(result.name).to.equal('Charmander');
      result = await cursor.next();
      expect(result.name).to.equal('Lapras');
      result = await cursor.next();
      expect(result.name).to.equal('Squirtle');
      await cursor.rewind();
      result = await cursor.next();
      expect(result.name).to.equal('Charmander');
    });
  });

  describe('size', function () {
    it('returns the number of results', async function () {
      await collection.insert([
          { name: 'Squirtle', type: 'water' },
          { name: 'Starmie', type: 'water' },
          { name: 'Charmander', type: 'fire' },
          { name: 'Lapras', type: 'water' }
      ]);

      let result = await collection.find().limit(2).size();

      expect(result).to.equal(2);
    });
  });

  describe('skip', function () {
    it('skips the specified number of results', async function () {
      await collection.insert([
          { name: 'Squirtle', type: 'water' },
          { name: 'Starmie', type: 'water' },
          { name: 'Charmander', type: 'fire' },
          { name: 'Lapras', type: 'water' }
      ]);

      let result = await collection.find().skip(2);

      expect(result.length).to.equal(2);
      expect(result[0].name).to.equal('Charmander');
      expect(result[1].name).to.equal('Lapras');
    });
  });

  describe('sort', function () {
    it('returns results in the requested order', async function () {
      await collection.insert([
          { name: 'Squirtle', type: 'water' },
          { name: 'Starmie', type: 'water' },
          { name: 'Charmander', type: 'fire' },
          { name: 'Lapras', type: 'water' }
      ]);

      let cursor = collection.find().sort({name: 1});

      let result = await cursor.next();
      expect(result.name).to.equal('Charmander');
      result = await cursor.next();
      expect(result.name).to.equal('Lapras');
      result = await cursor.next();
      expect(result.name).to.equal('Squirtle');
      result = await cursor.next();
      expect(result.name).to.equal('Starmie');
    });
  });

  describe('toArray', function () {
    it('returns results in an array', async function () {
      await collection.insert([
          { name: 'Squirtle', type: 'water' },
          { name: 'Starmie', type: 'water' },
          { name: 'Charmander', type: 'fire' },
          { name: 'Lapras', type: 'water' }
      ]);

      let result = await collection.find().toArray();

      expect(result).to.be.an.instanceof(Array);
      expect(result.length).to.equal(4);
    });
  });
});
