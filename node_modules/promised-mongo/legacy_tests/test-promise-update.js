var assert = require('assert');
var insert = require('./insert');

insert([{
	hello:'world'
}], function(db, done) {
	db.a.update({hello:'world'}, {$set:{hello:'verden'}})
		.then(function(lastErrorObject) {
			assert.equal(lastErrorObject.updatedExisting, true);
			assert.equal(lastErrorObject.n, 1);

			return db.a.findOne();
		})
		.then(function(doc) {
			assert.equal(doc.hello, 'verden');
			done();
		})
		.done();
});