var assert = require('assert');
var mongojs = require('../index').compatible();
var db = mongojs('test', ['a','b']);

db.a.save({hello: "world"})
	.then(function(doc) {
		assert.equal(doc.hello, "world");
		assert.ok(doc._id);

		doc.hello = "verden";
		return db.a.save(doc);
	})
	.then(function(doc) {
		assert.ok(doc._id);
		assert.equal(doc.hello, "verden");

		return db.a.remove();
	})
	.done(function () {
		db.close();
	});
