/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

SRCS = [
  // NOTE: Keep all source directories under lib/ to avoid breaking dependency
  // management in Android.mk
  'lib/base_version.js',
  'lib/camera.js',
  'lib/caps.js',
  'lib/config.js',
  'lib/crashreport.js',
  'lib/lights.js',
  'lib/log.js',
  'lib/main.js',
  'lib/ntp.js',
  'lib/sensors.js',
  'lib/ui.js',
  'lib/update.js',
  'lib/util.js',
  'lib/vibrator.js',
  'lib/wifi.js',
  'lib/btle/config-service.js',
  'lib/btle/ibeacon.js',
  'lib/btle/index.js',
  'lib/btle/scanner.js',
];

DIST_SRCS = {};
SRCS.forEach(function(path) { DIST_SRCS['dist/'+ path] = path; });

module.exports = function(grunt) {

  function exec(cmd, opts) {
    var execSync = require('child_process').execSync;
    grunt.log.writeln(execSync(cmd, opts));
  }

  grunt.registerTask('browserify', '', function() {
    exec('node_modules/.bin/browserify --node --ignore-missing dist/lib/main.js -o core.js');
  });
  grunt.registerTask('adb_setup', '', function() {
    exec('adb root');
    exec('adb wait-for-device', { timeout: 2000 });
    exec('adb remount');
  });
  grunt.registerTask('adb_push_core', '', function() {
    exec('adb push core.js /system/silk/');
  });
  grunt.registerTask('adb_restart_silk', '', function() {
    exec('adb shell setprop ctl.restart silk');
  });

  require("load-grunt-tasks")(grunt);

  grunt.initConfig({
    babel: {
      options: {
        sourceMap: true
      },
      dist: {
        files: DIST_SRCS
      }
    },
    eslint: {
      target: process.env.LAX ? [] : SRCS
    },
    watch: {
      scripts: {
        forever: false,
        files: SRCS.concat(['Gruntfile.js', 'package.json']),
        tasks: ['adb_setup', 'eslint', 'babel', 'browserify', 'adb_push_core', 'adb_restart_silk'],
        options: {
          spawn: false,
        },
      },
    },
  });

  // The default tasks to run when you type: grunt
  grunt.registerTask('default', ['eslint', 'babel', 'browserify']);
};
