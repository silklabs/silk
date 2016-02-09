/*
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

import gulp from 'gulp';
import createCommands from './commands';

const commands = createCommands(process.env.BASEDIR);

gulp.task('build', () => {
  let browserifyStream = commands.createBrowserifyStream();

  // Make sure browserify doesn't try to slurp up these native modules
  // TODO: generalize this to include our native modules or do something better
  browserifyStream.external('silk-cv');
  browserifyStream.external('silk-gc');

  return commands.build(browserifyStream);
});

gulp.task('lint', () => {
  if (process.env.LAX === '1') {
    console.log('Skipping lint...');
    return;
  }

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
