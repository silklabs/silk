// @noflow
'use strict';

const debug = require('debug');
const os = require('os');
const util = require('util');

let alog;

if (typeof process !== 'undefined') {
  if (os.platform() === 'android') {
    if (process.env.SILKLOG_NOCONSOLE) {
      alog = require('silk-alog');
    }
  } else {
    try {
      alog = require('silk-alog');
    } catch (err) {
      // Fall back to using console.*
    }
  }

  // If DEBUG environment variable is not set, select a sensible default.
  if (!process.env.DEBUG) {
    debug.enable('silk-*,-silk-*:debug,-silk-*:verbose');
  }
}

debug.formatArgs = function(args) {
  const diff = debug.humanize(this.diff);

  // Mimic console.* functions by treating additional arguments as
  // printf-style arguments.
  let msg = util.format.apply(util, args);
  args.length = 1;

  const format = `(+${diff}) ${msg}`;
  if (this.useColors) {
    msg = `\u001b[3${this.color}m${format}\u001b[0m`;
  } else {
    msg = format;
  }

  args[0] = msg;
};

function createLogger(libraryName, consoleFuncName, level) {
  const prefix = `${libraryName}:${level}`;
  // eslint-disable-next-line no-console
  const consoleFunc = console[consoleFuncName];
  const func = debug(prefix);

  if (alog) {
    const alogFunc = alog[level];
    func.log = function() {
      const args = Array.prototype.slice.call(arguments);
      alogFunc(libraryName, args[0]);
    };
  } else {
    func.log = function() {
      const args = Array.prototype.slice.call(arguments);
      consoleFunc.call(consoleFunc, `${prefix} ${args[0]}`);
    };
  }
  return func;
}

module.exports = function createLog(libraryName) {
  libraryName = `silk-${libraryName}`;
  return {
    debug: createLogger(libraryName, 'log', 'debug'),
    verbose: createLogger(libraryName, 'log', 'verbose'),
    info: createLogger(libraryName, 'info', 'info'),
    warn: createLogger(libraryName, 'warn', 'warn'),
    error: createLogger(libraryName, 'error', 'error'),
    fatal: createLogger(libraryName, 'error', 'fatal'),
  };
};

module.exports.configureLog = function configureLog() {
  debug.skips = [];
  debug.names = [];
  debug.enable.apply(null, arguments);
};
