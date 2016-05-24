var assert = require('assert');
var insert = require('./insert');

insert([{
	hello:'world1'
},{
	hello:'world2'
},{
	hello:'world3'
},{
	hello:'world4'
}], function(db, done) {
	db.a.find().skip(1).size().then(function(thesize) {
		assert.equal(thesize, 3);
		return db.a.find().limit(2).size();
	})
	.then(function(theothersize) {
		assert.equal(theothersize, 2);
		done();
	})
	.done();
});

