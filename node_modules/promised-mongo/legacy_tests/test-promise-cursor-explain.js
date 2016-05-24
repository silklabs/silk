var assert = require('assert');
var insert = require('./insert');

insert([{
	hello:'world1'
},{
	hello:'world2'
}], function(db, done) {
	var cursor = db.a.find();
	cursor.explain().then(function(result) {
		if (result.executionStats) {
			assert.equal(result.executionStats.totalDocsExamined, 2);
		} else {
			assert.equal(result.nscannedObjects, 2);
		}
		done();
	})
  .done();
});
