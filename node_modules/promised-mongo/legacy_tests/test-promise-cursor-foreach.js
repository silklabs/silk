var assert = require('assert');
var insert = require('./insert');

insert([{
	hello:'world1'
},{
	hello:'world2'
}], function(db, done) {
	var cursor = db.a.find();
    var i = 1;
  
    cursor
      .forEach(function (doc) {
        assert.equal(doc.hello, 'world' + (i++));
      })
      .then(function () {
        assert.equal(i, 3);
        done();
      })
      .done();
});

