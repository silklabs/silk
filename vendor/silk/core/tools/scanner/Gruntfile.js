module.exports = function(grunt) {
  require('load-grunt-tasks')(grunt);

  grunt.initConfig({
    babel: {
      options: {
        sourceMap: true
      },
      dist: {
       files: {
         'dist/index.js': '../../lib/btle/scanner.js'
       }
      }
    },
    eslint: {
      target: ['../../lib/btle/scanner.js']
    }
  });

  grunt.registerTask('default', ['babel', 'eslint']);
}
