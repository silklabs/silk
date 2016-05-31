#! /usr/bin/env node

/**
 * This script contains various tricks for extracting the bits we need to build
 * webrtc. While we use a custom generator to figure out which files are needed
 * for the build the gyp definitions are not perfect and miss header files and
 * tools.
 */

import path from 'path';
import fs from 'fs';
import mkdirp from 'mkdirp';

const PATH_CACHE = {};

// Never copy .git directories.
const SKIP_DIRS = new Set(['.git']);

// List of additional directories to copy.
const EXTRA_DIR_INCLUDES = [
  'build',
  // missing header files:
  'webrtc',
  // top level tools and symlinks into elsewhere:
  'tools',
  // symlinks and other third party tools used by webrtc build:
  'third_party',
  // gyp tools:
  'chromium/src/build',
  // extra build tools:
  'chromium/src/buildtools',
  // gyp python libary:
  'chromium/src/tools/gyp',
  // clang tools unused but causes build failures when missing.
  'chromium/src/tools/clang',
  // third party tools missing header files:
  'chromium/src/third_party/boringssl',
  'chromium/src/third_party/jsoncpp/source',
  'chromium/src/third_party/openmax_dl',
  'chromium/src/third_party/opus',
  'chromium/src/third_party/libyuv',
  'chromium/src/third_party/libjpeg_turbo',
  'chromium/src/third_party/libvpx_new',
  'chromium/src/third_party/expat',
  'chromium/src/third_party/libsrtp',
  // For Mac:
  // XXX: Sadly this is 15mb of stuff ...
  'chromium/src/third_party/yasm',
  'chromium/src/third_party/libc++-static',
];

function help() {
  console.log(`
    Usage: gen files.json <chromium source> <target>
  `);
}

function copyFile(source, dest) {
  if (fs.existsSync(source)) {
    // XXX: Pretty lame ... this has the side effect of ensuring we do not go
    // over the file descriptor limit though.
    const stat = fs.statSync(source);
    fs.writeFileSync(dest, fs.readFileSync(source), {
      mode: stat.mode
    });
  }
}

function symlinkFile(source, dest) {
  const name = path.basename(source);
  const linkPath = fs.readlinkSync(source);
  const cwd = process.cwd();
  process.chdir(path.dirname(dest));
  try {
    fs.symlinkSync(linkPath, name);
  } catch (err) {
    if (err.code !== 'EEXIST') {
      console.error(`Failed to symlink: ${name} to ${linkPath}`);
    }
  }
  process.chdir(cwd);
}

function copy(source, dest, seen = new Set()) {
  const stat = fs.lstatSync(source);
  if (stat.isFile()) {
    copyFile(source, dest);
    return;
  }

  if (stat.isDirectory() && !SKIP_DIRS.has(path.basename(source))) {
    copyDir(source, dest, seen);
    return;
  }

  if (stat.isSymbolicLink()) {
    symlinkFile(source, dest);
    return;
  }
}

function copyDir(source, dest, seen = new Set()) {
  const realpath = fs.realpathSync(source);
  if (seen.has(realpath)) {
    return;
  }
  seen.add(realpath);
  mkdirp.sync(dest);
  const read = fs.readdirSync(source);

  for (let name of read) {
    const absSource = path.join(source, name);
    const absDest = path.join(dest, name);
    copy(absSource, absDest, seen);
  }
}

function extract(source, files, destination) {
  if (!Array.isArray(files)) {
    console.error(`Given files.json is not an array.`);
    help();
    process.exit(1);
  }

  const seenDirectories = new Set();
  for (let file of files) {
    if (file.startsWith(source)) {
      const fileDest = path.join(destination, path.relative(source, file));
      const basedir = path.dirname(fileDest);

      if (!seenDirectories.has(basedir)) {
        mkdirp.sync(basedir);
      }

      copyFile(file, fileDest);
    }
  }
}

function main(argv) {
  if (argv.length < 3) {
    help();
    process.exit(1);
  }

  const [filesJson, source, target] = argv;

  if (!fs.existsSync(filesJson)) {
    console.error(`files.json must exist`);
    help();
    process.exit();
  }

  if (!fs.existsSync(source)) {
    console.error(`Chromium source must be given`);
    help();
    process.exit();
  }

  const absTarget = path.resolve(target);
  mkdirp.sync(absTarget);
  extract(path.resolve(source), require(filesJson), absTarget);

  for (const extra of EXTRA_DIR_INCLUDES) {
    const absSource = path.resolve(path.join(source, extra));
    const absDest = path.resolve(path.join(absTarget, extra));
    copy(absSource, absDest);
  }
}

main(process.argv.slice(2));
