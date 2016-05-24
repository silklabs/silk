var assert = require('assert');
var mongojs = require('../index').compatible();
var db = mongojs('test', ['test123']);

var errCalled = false;

db.test123.drop()
	.fin(function() {
		db.createCollection('test123')
			.then(function () {
				return db.createCollection('test123');
			})
			.fail(function () {
				errCalled = true;
			})
			.fin(function () {
				assert.ok(errCalled);
				db.close();
			})
			.done();
	})
	.done();
