/*
 * Copyright (c) 2015 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

import watchify from 'watchify';
import babelify from 'babelify';
import browserify from 'browserify';
import gulp from 'gulp';
import source from 'vinyl-source-stream';
import buffer from 'vinyl-buffer';
import gutil from 'gulp-util';
import sourcemaps from 'gulp-sourcemaps';
import cache from 'gulp-cache';
import eslint from 'gulp-eslint';
import path from 'path';
import { spawn } from 'mz/child_process';
import fs from 'fs';

export default function(baseDirectory = process.env.BASEDIR) {
  // Base directory which we are operating on ... All assets should be loaded and
  // stored there.
  baseDirectory = path.resolve(baseDirectory);
  let pkgSource = fs.readFileSync(path.join(baseDirectory, 'package.json'));
  // package.json from the basedir.
  let pkg = JSON.parse(pkgSource);

  // add custom browserify options here
  let browserifyStream = browserify();

  // Needed so gulp always operates on the base directory.
  function src(glob) {
    // XXX: The "base" option does not work so we use the whole baseDirectory.
    return gulp.src(path.join(baseDirectory, glob));
  }

  function getDestFile() {
    let destDir = '/system/silk/ext/';
    if (pkg.name === 'core') {
      // TODO: Remove this "core" module hack
      destDir = '/system/silk/';
    }
    let result = path.join(destDir, pkg.name);
    if (!path.extname(result)) {
      result += '.js';
    }
    return result;
  }

  let _cache;
  function getCache() {
    if (!_cache) {
      // Use a path inside the base directory so it is somewhat clearer what is
      // going on...
      _cache = new cache.Cache({
        tmpDir: baseDirectory,
        cacheDirName: '.gulpcache',
      });
    }
    return _cache;
  }

  let _babelrc;
  function getBabelrc() {
    if (!_babelrc) {
      _babelrc = fs.readFileSync(path.join(__dirname, '../babel.json'));
    }
    return _babelrc;
  }

  function createBrowserifyStream(options = {}) {
    let main = pkg.main;
    if (!path.extname(main)) {
      main += '.js';
    }

    let base = {
      entries: path.join(baseDirectory, `lib/${main}`), // start "--node"
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
      debug: true,
      exclude: '**/*.node',
      transform: [babelify.configure(
        JSON.parse(getBabelrc())
      )]
    };

    for (let key in options) {
      base[key] = options[key];
    }

    return browserify(base);
  }

  function build(browserifyStream) {
    // We heavily cache our assets we cache bust not only by their content but also
    // these values...
    let babelrc = getBabelrc();
    let cacheProps = [pkgSource, babelrc]

    return browserifyStream.bundle()
      .on('error', (err) => {
        if (err.codeFrame) {
          gutil.log('(browserify)', gutil.colors.red('Browserify Error'));
          gutil.log('(browserify)', err.toString());
          gutil.log('(browserify)', err.codeFrame);
          return;
        }
        gutil.log(err);
      })
      .pipe(source(pkg.main))
      .pipe(buffer())
      .pipe(sourcemaps.init({loadMaps: true})) // loads map from browserify file
      .pipe(sourcemaps.write('.')) // writes .map file
      .pipe(gulp.dest(baseDirectory));
  }

  function printExec(cmd) {
    return new Promise((accept, reject) => {
      let proc = spawn('/bin/bash', ['-c', cmd], {
        stdio: 'inherit'
      });
      gutil.log('$ ', cmd);
      proc.once('error', reject);
      proc.once('exit', (code) => {
        if (code !== 0) {
          proc.emit('error', new Error(`
            ${cmd} did not exit with zero
          `));
          return;
        }
        accept();
      });
    });
  }

  function lint() {
    let eslintrc = fs.readFileSync(path.join(__dirname, '../.eslintrc'));
    let cacheProps = [pkgSource, eslintrc];

    return src('lib/**/*.js')
      .pipe(cache(eslint(), {
        fileCache: getCache(),
        key: (file) => {
          return [file.contents].concat(cacheProps).join('');
        },
        // What on the result indicates it was successful
        success: function (lintedFile) {
          return lintedFile.eslint.messages.length === 0;
        },
        // What to store as the result of the successful action
        value: function(jshintedFile) {
          return {
            eslint: jshintedFile.eslint
          };
        }
      }))
      .pipe(eslint.format())
      .pipe(eslint.failAfterError());
  }

  function restart() {
    return printExec('adb shell setprop ctl.restart silk');
  }

  function restartExt() {
    return printExec(
      `adb shell setprop silk.reload-ext ${getDestFile()}`
    );
  }

  function push() {
    // Path on device...
    let dest = getDestFile();
    // Path on disk to the source...
    let src = path.join(baseDirectory, pkg.main);

    // This intentionally assumes you have a device plugged in and working for
    // speed...
    return printExec(`adb remount`).then(() => {
      return Promise.all([
        `adb push ${src} ${dest}`,
        `adb push ${src}.map ${dest}.map`
      ].map((cmd) => {
        return printExec(cmd);
      }));
    });
  }

  return {
    pkg,
    lint,
    build,
    getCache,
    getDestFile,
    createBrowserifyStream,
    push,
    restart,
    restartExt,
  };
};
