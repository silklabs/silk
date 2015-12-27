/**
 * Copyright (c) 2015 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

/* eslint-disable no-console */

export default class CmdArgParser {
  constructor() {
    this.cmds = {};
  }

  newCmd(cmd, options) {
    this.cmds[cmd] = {
      cmd,
      optionalArgs: options.optionalArgs || {},
      positionalArgs: options.positionalArgs || [],
      optionalPositionalArgs: options.optionalPositionalArgs || [],
      helpText: options.helpText || '',
    };
  }

  showHelpAndExit(cmd, error) {
    if (error) {
      console.log('error: ' + error + '\n');
    }
    console.log(this.cmds[cmd].helpText + '\n');
    process.exit(0);
  }

  doHelpCmd(cmd) {
    let err = '';
    let helpCmd = 'help'; // if no command specified, show general help command
    if (cmd) {
      if (cmd in this.cmds) {
        helpCmd = cmd;
      } else {
        err = `Unknown command: ${cmd}`;
      }
    }
    this.showHelpAndExit(helpCmd, err);
  }

  parse(argv) {
    let config = {};

    argv.shift(); // shift out node executable
    argv.shift(); // shift out script name

    config.cmd = argv.shift();
    if (!config.cmd) {
      this.showHelpAndExit('help');
    }
    if (!(config.cmd in this.cmds)) {
      this.showHelpAndExit('help', `Unknown command: ${config.cmd}`);
    }
    let cmdInfo = this.cmds[config.cmd];

    let pArgsIdx = 0;  // index into positionalArgs
    let opArgsIdx = 0; // index into optionalPositionalArgs

    let arg = argv.shift();
    while (arg) {
      if (arg[0] === '-') {
        if (arg[1] in cmdInfo.optionalArgs) {
          let argInfo = cmdInfo.optionalArgs[arg[1]];

          let argName = argInfo[0];
          let argType = argInfo[1];
          if (argType === 'string') {
            // optional arg expects a string value, e.g. '-v <value>'
            config[argName] = argv.shift();
          } else {
            // optional arg is just a flag
            config[argName] = true;
          }
        } else {
          this.showHelpAndExit(config.cmd, `${arg} option unexpected`);
        }
      } else {
        if (pArgsIdx < cmdInfo.positionalArgs.length) {
          let argName = cmdInfo.positionalArgs[pArgsIdx++];
          config[argName] = arg;
        } else if (opArgsIdx < cmdInfo.optionalPositionalArgs.length) {
          let argName = cmdInfo.optionalPositionalArgs[opArgsIdx++];
          config[argName] = arg;
        }
      }
      arg = argv.shift();
    }

    if (pArgsIdx !== cmdInfo.positionalArgs.length) {
      this.showHelpAndExit(config.cmd, 'number of required args not correct');
    }

    if (config.cmd === 'help') {
      // Special case, show specific help command
      this.doHelpCmd(config.command);
    }

    return config;
  }
}

