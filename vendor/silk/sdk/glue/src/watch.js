#! /usr/bin/env ./node_modules/.bin/babel-node

import watchify from 'watchify';
import gutil from 'gulp-util';
import eventToPromise from 'event-to-promise';
import AsciiTable from 'ascii-table';
import { exec } from 'mz/fs';
import createCommands from './commands';

const commands = createCommands(process.env.BASEDIR);

let browserifyStream = commands.createBrowserifyStream(watchify.args);
let bundle = watchify(browserifyStream);

let restartType = process.argv[2] === '--restart-ext' ?
  'restartExt' :
  'restart';

if (process.argv[2] === '--no-restart') {
  restartType = false;
}

function printTable(title, times) {
  let table = new AsciiTable(`watch: ${commands.pkg.name} (${title})`);
  table.setHeading(
    'Operation',
    'Duration'
  );

  for (let op in times) {
    table.addRow(op, `${times[op] / 1000} seconds`);
  }
  console.log(table.toString());
}

async function update() {
  let start = Date.now();
  let times = {};

  let browserifyOp = commands.build(bundle);

  /**
   * We do not consider lint failure an "error" here we simply report it so we
   * don't need a "LAX" mode this uses the caching mechanism defined in commands
   * so it should be very fast after the first lint.
   */
  let lintStatus = commands.lint();
  lintStatus.on('data', () => {});
  lintStatus.on('error', (err) => {
    // eat the errors here they are not very useful...
  });
  lintStatus.on('finish', (b) => {
    times.lint = Date.now() - start;
  });

  function onError(err) {
    times.browserify = Date.now() - start;
  }
  browserifyOp.once('error', onError)
  browserifyOp.once('finish', () => {
    times.browserify = Date.now() - start;
    browserifyOp.removeListener('error', onError);
  });

  let error;
  let lintComplete = eventToPromise(lintStatus, 'finish');

  try {
    // Wait for the build to finish...
    await eventToPromise(browserifyOp, 'finish');

    // Push it to the device...
    let pushStart = Date.now();
    await commands.push();
    times.push = Date.now() - pushStart;

    // Restarts are optional...
    if (restartType) {
      let restartStart = Date.now();
      await commands[restartType]();
      times.restart = Date.now() - restartStart;
    }
  } catch (err) {
    error = err;
    gutil.log('Error', err.stack);
  }

  times.total = Date.now() - start;
  printTable(error ? 'Failed' : 'Success', times);
};

// Listen for bundle updates...
bundle.on('update', update);
// Kick off the first build... Required to get update events.
update();
