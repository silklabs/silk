module.exports = function (grunt) {
  grunt.initConfig({
    babel: {
      dist: {
        files: [{
          expand: true,
          cwd: 'lib/',
          src: ['**/*.js'],
          dest: 'dist/'
        }]
      }
    },

    clean: ['dist']
  });

  require('load-grunt-tasks')(grunt);

  grunt.registerTask('default', ['clean', 'babel']);
};
