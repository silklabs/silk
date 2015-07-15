/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

SRCS = [
  // NOTE: Keep all source directories under lib/ to avoid breaking dependency
  // management in Android.mk
  'lib/camera.js',
  'lib/caps.js',
  'lib/config.js',
  'lib/crashreport.js',
  'lib/lights.js',
  'lib/log.js',
  'lib/main.js',
  'lib/ntp.js',
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
    }
  });

  // The default tasks to run when you type: grunt
  grunt.registerTask('default', ['eslint', 'babel']);
};
