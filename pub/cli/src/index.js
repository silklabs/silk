/**
 * @flow
 */

import {ArgumentParser} from 'argparse';

import loadConfig from './config';
import * as log from './logs';

import type { Config } from './config';

// TODO: we can do better here than `Object`
export type PluginArgument = [Array<string>, Object];
export type Plugin = {
  help?: string;
  arguments?: Array<PluginArgument>;
  // any because we don't care if this is async function or not.
  main: (argv: Object, context?: Object) => any;
};

export type PluginModule = {[key: string]: Plugin};

type SubCommand = {
  main: Function;
  path: string;
};

const parser = new ArgumentParser({
  prog: 'silk', // Hard code usage to ensure it works when invoked elsewhere.
  version: require('../package.json').version,
  description: `
    Silk Developer CLI
  `,
});

function validatePlugin(pluginPath: string, plugin: Plugin): boolean {
  let fields = Object.keys(plugin);
  if (fields.length === 0) {
    log.warn(`plugin error: ${pluginPath} has no exports...`);
    return false;
  }

  for (let name in plugin) {
    let cli = plugin[name];
    if (typeof cli !== 'object') {
      log.warn(`Export name: '${name}' of ${pluginPath} is not an object.`);
      return false;
    }

    if (typeof cli.main !== 'function') {
      log.warn(`Export name: '${name}' of ${pluginPath} has no .main`);
      return false;
    }
  }

  return true;
}

function loadPlugins(config: Config): {[key: string]: SubCommand} {
  let subcommands = {};
  // TODO: We could better split out canonical cli tools and extensions with
  // multiple top level sub parsers.
  let sub = parser.addSubparsers({
    title: 'Commands',
    help: `
    `,
    dest: 'subcommand',
  });

  for (let pluginPath of config.plugins) {
    let module;
    try {
      // $FlowFixMe: Flow wants this to be a literal.
      module = require(pluginPath);
    } catch (err) {
      log.warn(`Failed to load plugin: '${pluginPath}' (${err.message}) ${err.stack}`);
      continue;
    }

    // Validate plugin will spit out the appropriate warning.
    if (!validatePlugin(pluginPath, module)) {
      log.warn(`Skipping plugin: ${pluginPath} (see above warnings)`);
      continue;
    }

    for (let cliName in module) {
      let cli = module[cliName];
      let subcommandName = cli.name || cliName;
      subcommands[subcommandName] = { main: cli.main, path: pluginPath };
      let subcommandParser = sub.addParser(subcommandName, {
        addHelp: cli.help ? true : false,
        help: cli.help,
      });

      if (cli.arguments) {
        for (let argument of cli.arguments) {
          subcommandParser.addArgument(...argument);
        }
      }
    }
  }

  return subcommands;
}

function main () {
  let config = loadConfig();
  let subcommands = loadPlugins(config);
  let context = {};

  let argv = parser.parseArgs();

  if (argv.subcommand) {
    let subcommand = subcommands[argv.subcommand];
    try {
      let result = subcommand.main(argv, context);
      // Check if they return a promise?
      if (typeof result === 'object' && typeof result.catch === 'function') {
        result.catch((err) => {
          log.fatal(
            `Failed to execute '${argv.subcommand}' on plugin '${subcommand.path}' ${err.stack}`
          );
        });
      }
    } catch (err) {
      log.fatal(
        `Failed to execute '${argv.subcommand}' on plugin '${subcommand.path}' ${err.stack}`
      );
    }
  } else {
    parser.printHelp();
  }
}

main();
