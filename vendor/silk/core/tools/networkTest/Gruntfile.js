/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */
/**
 * Copyright (c) 2015 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

var fs = require('fs');
var path = require('path');

module.exports = function(grunt) {
  require('load-grunt-tasks')(grunt);

  var defaultTasks = ['eslint', 'babel', 'jsdataify', 'browserify'];

  grunt.registerMultiTask('jsdataify', 
      'Converts binary file to base64 js string', function() {
    this.files.forEach(function(filePair) {
      var src = filePair.orig.src[0];
      var base = path.basename(src, path.extname(src));

      var data = fs.readFileSync(src).toString('base64'); 
      var out = 'var ' + base + ' = \"' + data +
          '\";\n' + 'module.exports = ' + base + ';';
      fs.writeFileSync(filePair.dest, out);
    });
  });

  grunt.initConfig({
    pkg: grunt.file.readJSON('package.json'),

    browserify: {
      dist: {
        files: {
          'dist/<%= pkg.name %>.js': ['dist/lib/<%= pkg.main %>']
        },
        options: {
          browserifyOptions: {
            // start "--node"
            bare: true,
            browserField: false,
            builtins: false,
            commondir: false,
            detectGlobals: false,
            // end "--node"

            // Without the 'standalone' option, browserify stubs out the
            // module object and the resulting .js file can't be used as
            // a normal node module.
            standalone: '__unused',

            ignoreMissing: true,
            debug: true,
            exclude: '**/*.node',
          },
        }
      }
    },
    eslint: {
      dist: process.env.LAX ? [] : ['lib/**/*.js']
    },
    watch: {
      scripts: {
        forever: false,
        files: ['lib/**/*.js', 'Gruntfile.js', 'package.json'],
        tasks: defaultTasks,
        options: {
          spawn: false,
        },
      },
    },
    babel: {
      options: {
        sourceMap: true
      },
      dist: {
        files: [
          {
            expand: true,
            cwd: 'lib/',
            src: ['**/*.js'],
            dest: 'dist/lib'
          },
          {
           'dist/lib/log.js': '../../lib/log.js',
           'dist/lib/server.js': '../../lib/server.js',
          }
        ]
      }
    },
    jsdataify: {
      dist: {
        files: {
          'dist/lib/previewData.js': 'media/previewData.jpg',
          'dist/lib/logoData.js': 'media/logoData.png',
          'dist/lib/videoData.js': 'media/videoData.mp4',
        }
      }
    },
  });

  grunt.registerTask('default', defaultTasks);
}
