var assert = require('assert');
var mongojs = require('../index').compatible();
var db = mongojs('test', ['b.c']);

db.b.c.remove()
	.then(function() {
		return db.b.c.save({hello: "world"});
	})
	.then(function(rs) {
		return db.b.c.find().toArray();
	})
	.then(function(docs) {
		assert.equal(docs[0].hello, "world");
		return db.b.c.remove();
	})
	.fin(function () {
		db.close();
	})
	.done();
