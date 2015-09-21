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

  function getOption(name, defaultValue) {
    var value = grunt.option(name);
    return (value === undefined) ? defaultValue : value;
  }

  function getDestFile() {
    var destDir = '/system/silk/ext/';
    if (grunt.config('pkg.name') === 'core') {
      // TODO: Remove this "core" module hack
      destDir = '/system/silk/';
    }
    return grunt.config.process(destDir + '<%= pkg.name %>.js');
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
    var destFile = getDestFile();
    var adb_push ='adb push ' + srcFile + ' ' + destFile;
    grunt.log.writeln(adb_push);
    exec(adb_push);

    // If ANDROID_PRODUCT_OUT is defined ensure that the file that was just
    // built is removed from within there.  This is intended to prevent
    // unexpected behavior when using the |watch| command in conjunction with
    // |adb sync| -- |watch| will not populate ANDROID_PRODUCT_OUT with the
    // modified file and subsequently running |adb sync| can cause an older
    // version of the file to be copied onto the device.  Confusion ensues.
    //
    // The contents of ANDROID_PRODUCT_OUT should be considered ephemeral so
    // the potential of lost data by this strategy appears to be unlikely.
    //
    // Note that this problem is only specific to running |watch| within a
    // full build tree and would likely not manifest in an SDK-like
    // environment.
    if (process.env.ANDROID_PRODUCT_OUT) {
      var fs = require('fs');
      var outFile = process.env.ANDROID_PRODUCT_OUT + destFile;
      fs.unlink(outFile, function (err) {
        if (!err) {
          grunt.log.writeln('(Removed ' + outFile + ')');
        }
      });
    }

  });
  grunt.registerTask('silk_restart', '', function() {
    exec('adb shell setprop ctl.restart silk');
  });

  grunt.registerTask('reload_ext', '', function() {
    exec('adb shell setprop silk.reload-ext ' + getDestFile());
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
            cwd: 'lib/',
            src: ['**/*.js'],
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
          '<%= pkg.main %>': ['dist/<%= pkg.main %>']
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

        tasks: function() {
          var tasks = [].concat(defaultTaskList, 'adb_push');
          if (getOption('reload-ext', false)) {
            tasks.push('reload_ext');
          } else if (getOption('restart', true)) {
            tasks.push('silk_restart');
          }
          return tasks;
        }.apply(),
        options: {
          spawn: false,
        },
      },
    },
  });

  grunt.registerTask('default', defaultTaskList);
};
