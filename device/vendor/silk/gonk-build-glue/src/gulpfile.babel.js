/*
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

import gulp from 'gulp';
import createCommands from './commands';
import external from './external';

const commands = createCommands(process.env.BASEDIR);

gulp.task('build', () => {
  let browserifyStream = commands.createBrowserifyStream();
  external(browserifyStream);
  return commands.build(browserifyStream);
});

gulp.task('slug', ['build'], () => {
  return commands.slug();
});

gulp.task('push', ['slug'], () => {
  return commands.push();
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

gulp.task('default', ['lint', 'slug']);
