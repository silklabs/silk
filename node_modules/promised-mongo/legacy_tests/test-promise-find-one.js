var assert = require('assert');
var insert = require('./insert');

insert([{
	hello:'world1'
},{
	hello:'world2'
}], function(db, done) {
	db.a.findOne().done(function(doc) {
		assert.equal(typeof doc, 'object');
		assert.ok(doc.hello === 'world1' || doc.hello === 'world2');
		done();
	});
});