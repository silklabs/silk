var assert = require('assert');
var mongojs = require('../index').compatible();
var db = mongojs('localhost', ['test']);

process.once('uncaughtException', function(err) {
	assert(err.message === 'I should crash the program');
	process.exit(0);
});

db.test.findOne().done(function() {
	throw new Error('I should crash the program');
});

setTimeout(function() {
	throw new Error('timeout');
}, 5000);
