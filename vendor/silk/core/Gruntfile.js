/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

module.exports = function(grunt) {

  function exec(cmd, opts) {
    var execSync = require('child_process').execSync;
    grunt.log.writeln(execSync(cmd, opts));
  }

  grunt.registerTask('adb_push', '', function() {
    exec('adb root');
    exec('adb wait-for-device', { timeout: 2000 });
    exec('adb remount');
    exec(grunt.config.process('adb push <%= pkg.main %> /system/silk/'));
  });
  grunt.registerTask('adb_restart', '', function() {
    exec('adb shell setprop ctl.restart silk');
  });

  require("load-grunt-tasks")(grunt);

  grunt.initConfig({
    pkg: grunt.file.readJSON('package.json'),
    defaultTaskList: ['eslint', 'babel', 'browserify'],

    babel: {
      options: {
        sourceMap: true
      },
      dist: {
        files: [
          {
            expand: true,
            src: ['lib/**/*.js'],
            dest: 'dist/'
          }
        ],
      }
    },
    eslint: {
      dist: process.env.LAX ? [] : ['lib/**/*.js']
    },
    browserify: {
      dist: {
        files: {
          '<%= pkg.main %>': ['dist/lib/<%= pkg.main %>']
        },
        options: {
          browserifyOptions: {
            // start "--node"
            bare: true,
            browserField: false,
            buildins: false,
            commondir: false,
            detectGlobals: false,
            // end "--node"

            ignoreMissing: true,
            debug: process.env.TARGET_BUILD_VARIANT !== 'user',
            exclude: '**/*.node',
          },
        }
      }
    },
    watch: {
      scripts: {
        forever: false,
        files: ['lib/**/*.js', 'Gruntfile.js', 'package.json'],
        tasks: [].concat(grunt.config('defaultTaskList'), 'adb_push', 'adb_restart'),
        options: {
          spawn: false,
        },
      },
    },
  });

  grunt.registerTask('default', grunt.config('defaultTaskList'));
};
