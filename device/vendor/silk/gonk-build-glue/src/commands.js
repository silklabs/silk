/*
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

import watchify from 'watchify';
import babelify from 'babelify';
import browserify from 'browserify';
import cpr from 'cp-r';
import mkdirp from 'mkdirp';
import gulp from 'gulp';
import source from 'vinyl-source-stream';
import buffer from 'vinyl-buffer';
import gutil from 'gulp-util';
import gulpif from 'gulp-if';
import gulpgitignore from 'gulp-gitignore';
import uglify from 'gulp-uglify';
import sourcemaps from 'gulp-sourcemaps';
import cache from 'gulp-cache';
import eslint from 'gulp-eslint';
import path from 'path';
import fs from 'fs';
import vfs from 'vinyl-fs';
import printExec from './print_exec';
import external from './external';

// Note: this relies on the location of the silk sdk on disk.

export default function(baseDirectory = process.env.BASEDIR) {
  // Base directory which we are operating on ... All assets should be loaded and
  // stored there.
  baseDirectory = path.resolve(baseDirectory);
  const destDirectory = path.join(baseDirectory, '.silkslug');
  let pkgSource = fs.readFileSync(path.join(baseDirectory, 'package.json'));
  // package.json from the basedir.
  let pkg = JSON.parse(pkgSource);

  // add custom browserify options here
  let browserifyStream = browserify();
  external(browserifyStream);

  // Needed so gulp always operates on the base directory.
  function src(glob) {
    glob = (glob instanceof Array)? glob: [glob];

    var srcPaths = glob.map(function(src) {
      return path.join(baseDirectory, src);
   });

    // XXX: The "base" option does not work so we use the whole baseDirectory.
    return gulp.src(srcPaths);
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

  function createBrowserifyStream(options = {}) {
    let main = pkg.main;
    if (!path.extname(main)) {
      main += '.js';
    }

    let base = {
      entries: path.join(baseDirectory, `${main}`), // start "--node"
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
      transform: babelify.configure({
        presets: [require('babel-preset-silk-node4')]
      })
    };

    for (let key in options) {
      base[key] = options[key];
    }

    return browserify(base);
  }

  function build(browserifyStream) {
    // We heavily cache our assets we cache bust not only by their content but also
    // these values...
    let cacheProps = [pkgSource];

    let uglifyCfg = {
      compress: {keep_fnames: true},
      mangle: false
    };

    const mainDestPath = path.join(
      destDirectory,
      path.dirname(pkg.main)
    );

    mkdirp.sync(destDirectory);
    fs.writeFileSync(path.join(destDirectory, 'package.json'), pkgSource);

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
      // TODO: Re-enable uglify once we upgrade uglify to support generators or
      // add a babel plugin which produces code without generators.
      //.pipe(gulpif(!(process.env.NO_UGLY === '1' || process.env.LAX === '1'), uglify(uglifyCfg)))
      .on('error', err => {
        gutil.log('(uglify)', gutil.colors.red('Uglify Error'));
        gutil.log('(uglify)', err.message);
        gutil.log('(uglify)', err.fileName);
        gutil.log('(uglify)', err.lineNumber);
        process.exit(1);
      })
      .pipe(sourcemaps.write('.', {includeContent: true})) // writes .map file
      .pipe(gulp.dest(destDirectory));
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
      `adb shell setprop silk.module.push /system/silk/node_modules/${pkg.name}`
    );
  }

  function push() {
    // This intentionally assumes you have a device plugged in
    return printExec(`adb remount`).then(() => {

      // Push only the slug if it exists, otherwise push the entire module
      try {
        const slugDir = path.join(baseDirectory, '.silkslug');
        fs.accessSync(slugDir, fs.R_OK | fs.R_X);
        return printExec(`adb push ${slugDir} /system/silk/node_modules/${pkg.name}`);
      } catch (err) {}

      return printExec(`adb push ${baseDirectory} /system/silk/node_modules/${pkg.name}`);
    });
  }

  return {
    pkg,
    lint,
    build,
    getCache,
    createBrowserifyStream,
    push,
    restart,
    restartExt,
  };
};
