/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

var SRCS = [
  'api/config.js',
  'api/crypto.js',
  'api/id.js',
  'api/index.js',
  'api/state.js',
  'lib/accounts.js',
  'lib/challenge.js',
  'lib/main.js',
  'lib/routes.js',
  'lib/secrets.js',
  'lib/server.js',
  'lib/video.js',
  'test/api/test-check-key.js',
  'test/api/test-crypto.js',
  'test/api/test-id.js',
  'test/server/test-account-create.js',
  'test/server/test-account-auth.js',
  'test/server/test-device-register.js',
  'test/server/test-device-auth.js',
  'test/server/test-unsecured-video.js',
  'test/server/util.js',
];

var DIST_SRCS = {};
SRCS.forEach(function(path) { DIST_SRCS['dist/'+ path] = path; });

module.exports = function(grunt) {
  require("load-grunt-tasks")(grunt);

  grunt.initConfig({
    babel: {
      /*
       * Source maps break react-native's own babel/browserify-esque
       * setup (whatever it might be), so we can't generate them for now
       * since the api/ files are used across the project.
      options: {
        sourceMap: true
      },
       */
      dist: {
        files: DIST_SRCS
      }
    },

    browserify: {
      browserApi: {
        src: ['dist/api/index.js'],
        dest: 'public/silk-api.js',
      },
    },

    copy: {
      api: {
        src: 'package.api.json',
        dest: 'dist/api/package.json',
      },
    },

    nodeunit: {
      api: ['dist/test/api/test-*.js'],
      server: ['dist/test/server/test-*.js'],
    },

    eslint: {
      target: process.env.LAX ? [] : SRCS
    }
  });

  grunt.registerTask('all', ['eslint', 'babel', 'browserify', 'copy', 'nodeunit']);
  grunt.registerTask('test', ['nodeunit']);

  // The default tasks to run when you type: grunt
  grunt.registerTask('default', ['eslint', 'babel', 'browserify', 'copy']);
};
