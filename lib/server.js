/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

module.exports = function (port, ready) {
  var express = require('express');
  var app = express();
  var http = require('http').createServer(app);
  var io = require('socket.io')(http);
  var accounts = require('./accounts')();
  var path = require('path');

  var publicPath = path.join(__dirname, '/../../public');

  console.log('binding to port', port);
  console.log('__dirname is', __dirname);
  console.log('cwd is', process.cwd());
  console.log('serving static files from', publicPath);

  app.set('port', port);
  app.use(express.static(publicPath));

  var bodyParser = require('body-parser');
  app.use(bodyParser.json());

  // Install the routes.
  require('./routes')(app, io, accounts);

  http.listen(app.get('port'), ready);

  return http;
};
