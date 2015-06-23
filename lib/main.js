/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

var port = process.env.PORT || 5000;

require('./server')(port, function () {
  console.log("server is running at localhost: " + port);
});
