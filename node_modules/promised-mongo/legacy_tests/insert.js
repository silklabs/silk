var assert = require('assert');
var mongojs = require('../index').compatible();
var db = mongojs('test', ['a']);

module.exports = function(docs, test) {
	db.a.remove().then(function() {
		db.a.insert(docs).then(function() {
			test(db, function() {
				db.a.remove().then(function() {
					db.close();
				});
			});
		});
	});
};
