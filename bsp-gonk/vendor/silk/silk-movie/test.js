'use strict';

let Movie = require('.').Movie;

exports['sanity'] = function(test) {
  test.expect(2);

  let movie = new Movie();

  movie.run("/system/media/bootanimation.zip", function() {
    console.log("Movie stopped");
    test.ok(true);
    test.done();
    movie.hide();
    console.log("Movie hide");
  });

  setTimeout(function() {
    console.log("Timeout, stopping movie");
    movie.stop();
    test.ok(true);
  }, 1000);
}
