var assert = require('assert');
var insert = require('./insert');

insert([{
	hello:'world',
	another:'value'
}], function(db, done) {
	db.a.find({}, {another:1}).toArray().then(function(docs) {
		assert.equal(docs.length, 1);
		assert.equal(docs[0].hello, undefined);
		assert.equal(docs[0].another, 'value');
		done();
	})
  .done();
});
