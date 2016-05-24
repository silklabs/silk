var assert = require('assert');
var insert = require('./insert');

insert([{
	id: 1,
	hello: 'you'
}, {
	id: 2,
	hello: 'other'
}], function(db, done) {
	// Update and find the old document
	db.a.findAndModifyEx({
		query: { id: 1 },
		update: { $set: { hello: 'world' } },
	})
	.then(function(result) {
		var doc = result.result, lastErrorObject = result.lastErrorObject;
		assert.equal(doc.id, 1);
		assert.equal(doc.hello, 'you');
		assert.equal(lastErrorObject.updatedExisting, true);
		assert.equal(lastErrorObject.n, 1);

		// Update and find the new document
		return db.a.findAndModifyEx({
			query: { id: 2 },
			'new': true,
			update: { $set: { hello: 'me' } }
		});
	})
	.then(function(result) {
		var doc = result.result, lastErrorObject = result.lastErrorObject;
		assert.equal(doc.id, 2);
		assert.equal(doc.hello, 'me');
		assert.equal(lastErrorObject.updatedExisting, true);
		assert.equal(lastErrorObject.n, 1);

		// Remove and find document
		return db.a.findAndModifyEx({
			query: { id: 1 },
			remove: true
		});
	})
	.then(function(doc) {
		assert.equal(doc.id, 1);

		// Insert document using upsert
		return db.a.findAndModify({
			query: { id: 3 },
			update: { id: 3, hello: 'girl' },
			'new': true,
			upsert: true
		});
	})
	.then(function(result) {
		var doc = result.result, lastErrorObject = result.lastErrorObject;
		assert.equal(doc.id, 3);
		assert.equal(doc.hello, 'girl');
		assert.equal(lastErrorObject.n, 1);

		// Find non existing document
		return db.a.findAndModifyEx({
			query: { id: 0 },
			update: { $set: { hello: 'boy' } }
		});
	})
	.then(function(result) {
		var doc = result.result, lastErrorObject = result.lastErrorObject;
		assert.equal(lastErrorObject.updatedExisting, false);
		assert.equal(lastErrorObject.n, 1);
		assert.equal(String(lastErrorObject.upserted), String(doc._id));
		// Correct error handling
		return db.a.findAndModify({
			update: { $illigal: 1 }
		});
	})
	.fail(function(err) {
		assert(err instanceof Error);
		done();
	})
	.done();
});
