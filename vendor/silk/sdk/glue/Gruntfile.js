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

    var srcFile = grunt.config('pkg.main');
    var destDir = '/system/silk/ext/';
    if (grunt.config('pkg.name') === 'core') {
      // TODO: Remove this "core" module hack
      destDir = '/system/silk/';
    }
    var destFile = grunt.config.process(destDir + '<%= pkg.name %>.js');
    var adb_push ='adb push ' + srcFile + ' ' + destFile;
    grunt.log.writeln(adb_push);
    exec(adb_push);
  });
  grunt.registerTask('silk_restart', '', function() {
    exec('adb shell setprop ctl.restart silk');
  });

  require("load-grunt-tasks")(grunt);

  var defaultTaskList = ['eslint', 'babel', 'browserify'];
  grunt.initConfig({
    pkg: grunt.file.readJSON('package.json'),

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
            builtins: false,
            commondir: false,
            detectGlobals: false,
            // end "--node"

            // Without the 'standalone' option, browserify stubs out the module
            // object and the resulting .js file can't be used as a normal node
            // module.
            standalone: '__unused',

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
        tasks: [].concat(defaultTaskList, 'adb_push', 'silk_restart'),
        options: {
          spawn: false,
        },
      },
    },
  });

  grunt.registerTask('default', defaultTaskList);
};
