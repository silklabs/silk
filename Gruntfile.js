/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

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
        // We only need to browserify the api folder (rest is done server side)
        files: ['api/**/*.js']
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
      target: process.env.LAX ? [] : ['lib/**/*.js', 'test/**/*.js', 'api/**/*.js']
    }
  });

  grunt.registerTask('all', ['eslint', 'babel', 'browserify', 'copy', 'nodeunit']);
  grunt.registerTask('test', ['nodeunit']);

  // The default tasks to run when you type: grunt
  grunt.registerTask('default', ['eslint', 'babel', 'browserify', 'copy']);
};
