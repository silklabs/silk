
var assert = require('assert');
var insert = require('./insert');

insert([{
	hello: "world"
},{
	hello: "world2"
},{
	hello: "world3"
},{
	hello: "world"
}], function(db, done) {
	db.runCommand({count: "a", query:{}})
		.then(function(res) {
			assert.equal(res.n, 4);
			return db.a.runCommand('count', {query: {hello: "world"}});
		})
		.then(function(res) {
			assert.equal(res.n, 2);
			return db.a.runCommand('distinct', {key: "hello", query:{}});
		})
		.then(function(docs) {
			assert.equal(docs.values.length, 3);
			return db.runCommand({distinct:'a', key:"hello", query:{hello:"world"}});
		})
		.then(function(docs) {
			assert.equal(docs.values.length, 1);
			return db.runCommand("ping");
		})
		.then(function(res) {
			assert.equal(res.ok,1);
			return db.a.runCommand("count");
		})
		.then(function(res) {
			assert.equal(res.n, 4);
			done();
		})
		.done();
});
