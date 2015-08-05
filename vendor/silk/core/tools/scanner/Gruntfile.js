module.exports = function(grunt) {
  require('load-grunt-tasks')(grunt);

  grunt.initConfig({
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
    copy: {
      dist: {
        files: {
          'lib/btle/scanner.js': '../../lib/btle/scanner.js',
          'lib/api.js': '../../lib/api.js',
          'lib/util.js': '../../lib/util.js',
          'lib/log.js': '../../lib/log.js',
        }
      }
    }
  });

  grunt.registerTask('default', ['copy', 'babel']);
}
