/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

module.exports = function(grunt) {
  require('load-grunt-tasks')(grunt);

  grunt.initConfig({
    shell: {
      // Use the babel command directly so we can get all the features and
      // globs.
      babel: {
        command: function() {
          return [
            './node_modules/.bin/babel',
            'api/**/*.js',
            '-d dist'
          ].join(' ');
        }
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

  grunt.registerTask('all', ['eslint', 'shell:babel', 'browserify', 'copy', 'nodeunit']);
  grunt.registerTask('test', ['nodeunit']);

  // The default tasks to run when you type: grunt
  grunt.registerTask('default', ['eslint', 'shell:babel', 'browserify', 'copy']);
};
