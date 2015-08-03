/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

var movie = require('./index')();

exports['sanity'] = function(test) {
  test.expect(2)

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
