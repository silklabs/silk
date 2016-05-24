
var staticAlias = require('../lib/node-static-alias');

//var log4js = require('log4js');
//var logger = log4js.getLogger('node-static-alias');
//logger.setLevel(log4js.levels.INFO);

process.chdir(__dirname);

var fileServer = new staticAlias.Server('./public', {
  alias: [

    // file.min.ext --> file.ext
    {
      match: /\.min\.(?:js|css)$/,
      serve: function(params) {
        return params.absDir + '/' + params.basename.replace(/\.min$/, '.') + params.suffix;
      }
    },

    // outside of document-root
    {
      match: ['suffix=png', 'suffix=jpg'],
      serve: '../outer/<% fileName %>',
      allowOutside: true
    },

    // directoryIndex
    {
      match: /\/$/,
      serve: '<% absPath %>/default.html'
    },

  ],
  //logger: logger
  logger: console
});

console.log('START (http://127.0.0.1:8080/)');

require('http').createServer(function(request, response) {
  request.addListener('end', function() {
    fileServer.serve(request, response);
  }).resume();
}).listen(8080);

