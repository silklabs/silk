var assert = require('assert');
var insert = require('./insert');

insert([{
	hello:'world'
}], function(db, done) {
	db.a.find({_id:db.ObjectId('abeabeabeabeabeabeabeabe')}, {hello:1}).toArray()
		.then(function(docs) {
			assert.equal(docs.length, 0);
			return db.a.save({_id:db.ObjectId('abeabeabeabeabeabeabeabe')});
		})
		.then(function() {
			return db.a.find({_id:db.ObjectId('abeabeabeabeabeabeabeabe')}, {hello:1}).toArray();
		})
		.then(function(docs) {
			assert.equal(docs.length, 1);
			done();
		})
		.done();
});
