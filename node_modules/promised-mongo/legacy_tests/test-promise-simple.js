var assert = require('assert');
var mongojs = require('../index').compatible();
var db = mongojs('test', ['a','b']);

db.a.find().toArray().done(function(docs) {
	assert.equal(docs.length, 0);
	db.close();
});
