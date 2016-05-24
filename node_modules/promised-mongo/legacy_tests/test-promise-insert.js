var assert = require('assert');
var mongojs = require('../index').compatible();
var db = mongojs('test', ['a','b']);

db.a.insert([{name: "Squirtle"}, {name: "Charmander"}, {name: "Bulbasaur"}])
	.then(function(docs) {
		assert.ok(docs[0]._id);
		assert.ok(docs[1]._id);
		assert.ok(docs[2]._id);

		// It should only return one document in the 
		// callback when one document is passed instead of an array
		return db.a.insert({name: "Lapras"});
	})
	.then(function(doc) {
		assert.equal(doc.name, "Lapras");

		// If you pass a one element array the callback should
		// have a one element array
		return db.a.insert([{name: "Pidgeotto"}]);
	})
	.then(function (docs) {
		assert.equal(docs[0].name, "Pidgeotto");
		assert.equal(docs.length, 1);
		
		return db.a.remove();
	})
	.done(function () {
		db.close();
	});
