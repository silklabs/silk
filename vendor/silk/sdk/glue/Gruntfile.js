/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */
/**
 * Copyright (c) 2015 Silk Laboratories, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Laboratories, Inc.
 */

var debug = process.env.TARGET_BUILD_VARIANT !== 'user';

module.exports = function(grunt) {

  function exec(cmd, opts) {
    var execSync = require('child_process').execSync;
    grunt.log.writeln(execSync(cmd, opts));
  }

  // Ensure there are no node_modules/ directories lower in the tree (even
  // outside the root directory of the workspace) that could inadvertently be
  // pulled into the browersify output and unexpectedly alter the resulting
  // program.
  grunt.registerTask('ban_parent_node_modules', '', function() {
    function ban_parent_node_modules(dir) {
      if (!dir) {
        dir = process.cwd();
      }

      var path = require('path');
      var fs = require('fs');

      var dir = path.dirname(dir);
      var nm = path.join(dir, 'node_modules');
      if (fs.existsSync(nm)) {
        grunt.fail.fatal('Please remove "' + nm + '" to continue');
        return;
      }
      if (dir !== '/') {
        ban_parent_node_modules(dir);
      }
    }
    ban_parent_node_modules();
  });

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

  var defaultTaskList = ['eslint', 'babel', 'ban_parent_node_modules', 'browserify'];
  grunt.initConfig({
    pkg: grunt.file.readJSON('package.json'),

    babel: {
      options: {
        sourceMap: debug ? 'inline' : false,
        stage: 0,
        optional: [
          "asyncToGenerator"
        ],
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
            debug: debug,
            exclude: '**/*.node',
          },
          transform: [
            // Adjust source map filenames to exclude the 'dist/lib' prefix
            // added to the transpiled source
            function() {
              var mold = require('mold-source-map');
              return mold.transformSources(
                function(file) {
                  return '../../' + file;
                }
              );
            },
          ],
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
