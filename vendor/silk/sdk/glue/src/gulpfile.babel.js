/*
 * Copyright (c) 2015 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

import gulp from 'gulp';
import createCommands from './commands';

const commands = createCommands(process.env.BASEDIR);

gulp.task('build', () => {
  let browserifyStream = commands.createBrowserifyStream();
  return commands.build(browserifyStream);
});

gulp.task('lint', () => {
  return commands.lint();
});

// Clear the cache...
gulp.task('clean', function (done) {
  commands.getCache().clear(null, done);
});

gulp.task('push', () => {
  return commands.push();
});

gulp.task('default', ['lint', 'build']);
