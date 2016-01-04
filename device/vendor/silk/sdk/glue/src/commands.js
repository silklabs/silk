/*
 * Copyright (c) 2015-2016 Silk Labs, Inc.
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
import gulpif from 'gulp-if';
import uglify from 'gulp-uglify';
import sourcemaps from 'gulp-sourcemaps';
import cache from 'gulp-cache';
import eslint from 'gulp-eslint';
import path from 'path';
import fs from 'fs';
import printExec from './print_exec';

// Note: this relies on the location of the silk sdk on disk.

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
    glob = (glob instanceof Array)? glob: [glob];

    var srcPaths = glob.map(function(src) {
      return path.join(baseDirectory, src);
   });

    // XXX: The "base" option does not work so we use the whole baseDirectory.
    return gulp.src(srcPaths);
  }

  function trimSlash(str) {
    if (str[str.length - 1] === '/') {
      return str.slice(0, -1);
    }
    return str;
  }

  /**
   * It's important to remember that this is not the canonical way to push files
   * but a convenience wrapper so we need to be careful to match what the
   * Android build system does.
   *
   * This will figure out where to put the JS files for example:
   *
   *  - vendor/silk/core -> /system/silk/core.js
   *  - vendor/silk/profiler -> /system/silk/profiler.js
   *  - vendor/silk/ext/foo -> /system/ext/foo/index.js
   */
  function getDestFile() {
    // XXX: Nasty hack since we don't know where we are in the silk tree...
    let search = 'vendor/silk';
    let startingPoint = path.resolve(__dirname);
    let vendorStart = startingPoint.lastIndexOf(search);
    let vendorSegment = startingPoint.slice(vendorStart + search.length + 1);

    // Everything before the node_modules directory is the path to the
    // component.
    let relativePath = trimSlash(vendorSegment.split('node_modules')[0]);
    // Pop the first part of the path off (silk/core goes into silk/core.js)
    let destDir = path.join(relativePath, '..');

    let dest = path.join(destDir, pkg.main);
    if (!path.extname(dest)) {
      dest += '.js';
    }
    return `/system/silk/${dest}`;
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

    let uglifyCfg = {
      compress: {keep_fnames: true},
      mangle: false
    };

    return browserifyStream.bundle()
      .on('error', (err) => {
        if (err.codeFrame) {
          gutil.log('(browserify)', gutil.colors.red('Browserify Error'));
          gutil.log('(browserify)', err.toString());
          gutil.log('(browserify)', err.codeFrame);
        } else {
          gutil.log(err);
        }
        process.exit(1);
      })
      .pipe(source(pkg.main))
      .pipe(buffer())
      .pipe(sourcemaps.init({loadMaps: true})) // loads map from browserify file
      .pipe(gulpif(!(process.env.NO_UGLY === '1'), uglify(uglifyCfg)))
      .on('error', err => {
        gutil.log('(uglify)', gutil.colors.red('Uglify Error'));
        gutil.log('(uglify)', err.message);
        gutil.log('(uglify)', err.fileName);
        gutil.log('(uglify)', err.lineNumber);
        process.exit(1);
      })
      .pipe(sourcemaps.write('.', {includeContent: true})) // writes .map file
      .pipe(gulp.dest(baseDirectory));
  }

  function lint() {
    let eslintrc = fs.readFileSync(path.join(__dirname, '../.eslintrc'));
    let cacheProps = [pkgSource, eslintrc];

    return src(['lib/**/*.js', 'test/**/*.js'])
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
