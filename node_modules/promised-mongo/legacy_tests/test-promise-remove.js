var assert = require('assert');
var insert = require('./insert');

// Delete just one
insert([{
	name:'Squirtle', type:'water'
}, {
	name:'Starmie' , type:'water'
}, {
	name:'Lapras'  , type:'water'
}], function(db, done) {
	// Remove just one
	db.a.remove({type:'water'}, true)
		.then(function(lastErrorObj) {
			assert.equal(lastErrorObj.n, 1);
			return db.a.find({type:'water'}).toArray();
		})
		.then(function(docs) {
			assert.equal(docs.length, 2);
			assert.equal(docs[0].name, 'Starmie');

			// Normal remove
			return db.a.remove({type:'water'});
		})
		.then(function(lastErrorObj) {
			assert.equal(lastErrorObj.n, 2);
			return db.a.find({type:'water'}).toArray();
		})
		.then(function(docs) {
			assert.equal(docs.length, 0);
			done();
		})
		.done();
});
