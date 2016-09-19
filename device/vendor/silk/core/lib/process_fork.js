/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @flow
 */

import {fork as nodeFork} from 'child_process';
import invariant from 'assert';

import * as util from 'silk-sysutils';
import createLog from 'silk-log/device';

import type {ChildProcess} from 'child_process';

export type Options = {
  // Standard child_process fork options.
  cwd?: string;
  env?: Object;
  execPath?: string;
  execArgv?: Array<string>;
  silent?: boolean;
  uid?: number;
  gid?: number;

  // Our extra options.
  name: ?string;
  restart: ?boolean;
};

type sendMessage = any;
type sendHandle = any;
type sendCallback = (error: ?Error) => void;

type QueuedMessage = {
  message: sendMessage;
  handle: ?sendHandle;
  callback: ?sendCallback;
};

// XXX Fix somehow (#1064)
type Log = {
  verbose: Function;
  debug: Function;
  info: Function;
  warn: Function;
  error: Function;
  fatal: Function;
};

function logName(child: ChildProcess, options: ?Options): string {
  return (options && options.name) ?
         `child['${options.name}']` :
         `child[${child.pid}]`;
}

function wrapDisconnect(child: ChildProcess, log: Log): (() => void) {
  const reallyDisconnect = child.disconnect.bind(child);
  let disconnected = false;

  return function wrappedDisconnect() {
    invariant(!disconnected);
    disconnected = true;

    log.info(`Disconnecting`);
    reallyDisconnect();
  };
}

function wrapKill(child: ChildProcess, log: Log): ((signal?: string) => void) {
  const reallyKill = child.kill.bind(child);
  let killed = false;

  return function wrappedKill(signal?: string) {
    invariant(!killed);
    killed = true;

    log.info(`Attempting to kill with signal '${(signal || `SIGINT`)}'`);
    reallyKill(signal);
  };
}

function wrapSend(
  child: ChildProcess,
  log: Log,
): ((message: sendMessage, handle?: sendHandle, callback?: sendMessage) => boolean) {
  const reallySend = child.send.bind(child);
  const queue: Array<QueuedMessage> = [];
  let full: boolean = false;

  child.once(`disconnect`, () => {
    queue.length = 0;
  });

  function sendNext(): void {
    invariant(!full);
    invariant(queue.length);

    const next = queue.shift();
    invariant(next);

    if (!child.connected) {
      log.warn(`Cannot send because child has disconnected`, next);
      return;
    }

    let nowFull = false;

    const callback = (error) => {
      invariant(next);

      if (error) {
        log.warn(`Failed to send message`, next.message, error);
      }

      if (next.callback) {
        process.nextTick(() => {
          invariant(next);
          invariant(next.callback);
          next.callback(error);
        });
      } else if (error) {
        process.nextTick(() => {
          child.emit(`error`, error);
        });
      }

      if (nowFull) {
        invariant(full);

        log.info(`Message pipe is no longer full`);
        full = false;
      }

      while (!full && queue.length) {
        sendNext();
      }
    };

    log.debug(`Sending`, next.message);

    full = nowFull = reallySend(next.message, next.handle, callback);
    if (nowFull) {
      log.warn(`Message pipe is now full`);
    }
  }

  return function wrappedSend(
    message: sendMessage,
    handle?: sendHandle,
    callback?: sendMessage
  ): boolean {
    invariant(message);

    if (!child.connected) {
      log.warn(`Cannot send because child has disconnected`, message);
      return false;
    }

    queue.push({
      message,
      handle,
      callback,
    });

    if (full) {
      log.warn(`Send delayed because message pipe is full`, message);
      return false;
    }

    while (!full && queue.length) {
      sendNext();
    }

    return !full;
  };
}

export function wrap(child: ChildProcess, options?: Options, log?: Log): void {
  invariant(child);

  const realLog = log || createLog(logName(child, options));

  const errorListener = (error) => {
    realLog.error(`Error`, error);
  };
  child.addListener(`error`, errorListener);

  const messageListener = (message) => {
    realLog.debug(`Received`, message);
  };
  child.addListener(`message`, messageListener);

  let stdoutListener = null;
  if (child.stdout) {
    stdoutListener = (buffer) => {
      realLog.info(buffer.toString().trim());
    };
    child.stdout.addListener(`data`, stdoutListener);
  }

  let stderrListener = null;
  if (child.stderr) {
    stderrListener = (buffer) => {
      realLog.warn(buffer.toString().trim());
    };
    child.stderr.addListener(`data`, stderrListener);
  }

  child.once(`disconnect`, () => {
    child.removeListener(`message`, messageListener);

    realLog.info(`Disconnected`);
  });

  child.once(`exit`, (code, signal) => {
    child.removeListener(`error`, errorListener);
    child.removeListener(`message`, messageListener);
    if (stdoutListener) {
      child.stdout.removeListener(`data`, stdoutListener);
    }
    if (stderrListener) {
      child.stderr.removeListener(`data`, stderrListener);
    }

    if (signal) {
      realLog.warn(`Killed with signal '%s'`, signal);
    } else if (code !== 0) {
      realLog.warn(`Exited with code %d`, code);
    } else {
      realLog.info(`Exited normally`);
    }
  });

  // $FlowFixMe: Flow doesn't like it when we replace functions.
  child.disconnect = wrapDisconnect(child, realLog);
  // $FlowFixMe: Flow doesn't like it when we replace functions.
  child.kill = wrapKill(child, realLog);
  // $FlowFixMe: Flow doesn't like it when we replace functions.
  child.send = wrapSend(child, realLog);
}

export default function fork(
  modulePath: string,
  argsOrOptions?: Array<string> | Options,
  maybeOptions?: Options
): ChildProcess {
  let args, options;
  if (Array.isArray(argsOrOptions)) {
    args = argsOrOptions;
    options = Object.assign({}, maybeOptions);
  } else if (argsOrOptions && typeof argsOrOptions !== 'object') {
    throw new TypeError('Incorrect value of args option');
  } else {
    args = [];
    options = Object.assign({}, argsOrOptions);
  }

  // Never reuse stdin/stdout from the parent.  If the parent crashes, the child
  // will remain connected to the IO even though the parent is now a zombie
  // (at least when running under /system/bin/logwrapper)
  options.silent = true;

  // Don't permit --debug to be inherited from the parent process, instead only
  // enable if the debugger has been explicitly requested for this child.
  let execArgv = options.execArgv || process.execArgv;
  execArgv = execArgv.filter(arg => arg !== '--debug');
  if (util.getstrprop('persist.silk.debugger', '') === options.name) {
    execArgv.push('--debug');
  }
  options.execArgv = execArgv;

  const child = nodeFork(modulePath, args, options);

  const log = createLog(logName(child, options));
  log.info(`Launched '${modulePath}' with pid ${child.pid}`);

  wrap(child, options, log);

  if (options.restart) {
    const exitListener = () => {
      child.removeListener(`exit`, exitListener);

      process.nextTick(() => {
        log.info(`Restarting`);

        const newChild = fork(modulePath, args, options);
        child.emit(`restart`, newChild);
      });
    };

    child.addListener(`exit`, exitListener);

    // $FlowFixMe: Flow doesn't like it when we add functions.
    child.cancelRestart = () => {
      log.info(`Canceling restart`);
      child.removeListener(`exit`, exitListener);
    };
  }

  return child;
}
