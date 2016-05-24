var assert = require('assert');
var insert = require('./insert');

insert([{
	hello:'world'
}], function(db, done) {
	db.a.find().toArray().then(function(docs) {
		assert.equal(docs.length, 1);
		assert.equal(docs[0].hello, 'world');
		done();
	})
  .done();
});