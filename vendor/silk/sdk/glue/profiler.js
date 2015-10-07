#! /usr/bin/env ./node_modules/.bin/babel-node

import fetch from 'node-fetch';
import net from 'net';
import fs from 'fs';
import path from 'path';
import eventToPromise from 'event-to-promise';
import gutil from 'gulp-util';
import printExec from './src/print_exec';
import { spawn, exec } from 'mz/child_process';
import { ArgumentParser } from 'argparse';
import { SourceMapConsumer } from 'source-map';

// Run in the cwd of the module which loads silk-sdk-glue...
if (process.env.BASEDIR) {
  process.chdir(process.env.BASEDIR);
}

const DEVICE_PORT = 60024;
// Only resolve sourcemap for files which start with this.
const JS_FILE_PREFIX = '/system/silk';

function url (path) {
  return `http://localhost:${DEVICE_PORT}/${path}`;
}

async function httpCheck(res) {
  if (res.status > 199 && res.status < 300) {
    return true;
  }
  let text = await res.text();
  console.error(`Error in request`, text);
  process.exit(1);
}


async function loadSourcemap(name) {
  let body = JSON.stringify({ path: name });
  let res = await fetch(url('sourcemap'), {
    body,
    headers: {
      'Content-Length': Buffer.byteLength(body),
      'Content-Type': 'application/json'
    }
  });
  if (!res.ok) {
    let text = await res.text();
    throw new Error(text);
  }
  return await res.text();
}

let _sourcemapPromises = new Map();
function getSourcemap(name) {
  if (!_sourcemapPromises.has(name)) {
    _sourcemapPromises.set(name, loadSourcemap(name).then((sourcemap) => {
      return new SourceMapConsumer(sourcemap);
    }));
  }
  return _sourcemapPromises.get(name);
}


async function updateCPUProfileSample(sample) {
  let sourcemapLocation = `${sample.url}.map`;
  let sourcemap;
  try {
    sourcemap = await getSourcemap(sourcemapLocation);
  } catch (err) {
    console.error('Could not resolve .map path for', sourcemapLocation);
    return;
  }

  let position = sourcemap.originalPositionFor({
    line: sample.lineNumber,
    column: 0
  });

  if (position.source) {
    sample.url = position.source;
    sample.lineNumber = position.line;
  } else {
    console.error(`
      Cannot resolve path in ${sourcemapLocation} at ${sample.lineNumber}
    `);
  }
}

async function resolveCPUProfileTrace(samples) {
  let ops = [];

  for (let sample of samples) {
    if (sample.url.indexOf(JS_FILE_PREFIX) === 0) {
      ops.push(updateCPUProfileSample(sample));
    }

    if (sample.children) {
      ops.push(resolveCPUProfileTrace(sample.children));
    }
  }
  await Promise.all(ops);
}

async function resolveCPUProfile(profile) {
  await resolveCPUProfileTrace([profile.head]);
  return profile;
}

const parser = new ArgumentParser({});

const subcommands = parser.addSubparsers({
  title: 'Commands',
  dest: 'command',
  help: 'Profiler commands...'
});

subcommands.addParser('cpu-start', {
  help: `
    Start a cpu profiler session
  `
});

const cpuCollectCmd = subcommands.addParser('cpu-collect', {
  help: `
    Stops and collects currently running cpu profiler
  `
});

cpuCollectCmd.addArgument(['--out'], {
  help: `Output cpuprofile to specific file`,
});

const expandSourcemapCmd = subcommands.addParser('expand-sourcemap', {
  help: `
    Resolve the sourcemaps of a given capture
  `
});

expandSourcemapCmd.addArgument(['path'], {
  help: `Path to the sourcemap to expand`
});

expandSourcemapCmd.addArgument(['destination'], {
  help: `New path for the expansion`
});

async function cpuStart() {
  let res = await fetch(url('start/cpu'));
  await httpCheck(res);
}

async function cpuCollect(args) {
  let res = await fetch(url('collect/cpu'));
  await httpCheck(res);
  let output = await res.json();
  let resolvedCpuProfile = await resolveCPUProfile(output);

  let dest =
    args.out || path.join(process.cwd(), `silk_${Date.now()}.cpuprofile`);

  gutil.log(`Profile written to: ${dest}`);
  let out = fs.createWriteStream(dest);
  out.end(JSON.stringify(resolvedCpuProfile, null, 2));
}

async function expandSourcemap(args) {
  let original = require(path.resolve(args.path));
  let newSource = await resolveCPUProfile(original);

  let out = fs.createWriteStream(args.destination);
  out.end(JSON.stringify(newSource, null, 2));
}

async function main() {
  let args = parser.parseArgs();
  // TODO: Allow this to be configured...
  await printExec(`adb forward tcp:${DEVICE_PORT} tcp:${DEVICE_PORT}`);

  switch (args.command) {
  case 'cpu-start':
    return await cpuStart();
  case 'cpu-collect':
    return await cpuCollect(args);
  case 'expand-sourcemap':
    return await expandSourcemap(args);
  default:
    // no action...
  }
}

main().catch((err) => {
  setTimeout(() => {
    throw err;
  });
});
