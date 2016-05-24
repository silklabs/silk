var assert = require('assert');
var insert = require('./insert');

insert([{
	hello:'world'
}], function(db, done) {
	var sync = true;
	db.a.update({hello:'world'}, {$set:{hello:'verden'}})
		.then(function(lastErrorObject) {
			assert.ok(!sync);
			assert.equal(lastErrorObject.updatedExisting, true);
			assert.equal(lastErrorObject.n, 1);
			done();
		})
		.done();
	sync = false;
});
