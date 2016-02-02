/*
 * Figure out the given configuration for the CLI run. This will resolve and
 * merge both global and local settings.
 *
 * @flow
 */

import path from 'path';
import fs from 'fs';

import lookup from 'look-up';
import json5 from 'json5';
import resolve from 'resolve';
import createDebug from 'debug';

import * as log from './logs';


// Internal type for config files loaded from disk.
type InputConfig = {
  // name to path for plugins...
  plugins?: Array<string>
};

export type Config = {
  plugins: Array<string>
}

const GLOBAL_ROOT = path.resolve('~/.silk/');
const PLUGIN_PREFIX = 'silk-plugin-';
const SILKRC = '.silkrc';

const debug = createDebug('silk-cli:config');

function requireConfig(pathName: string): InputConfig {
  debug('json5', pathName);
  let content;
  try {
    content = fs.readFileSync(pathName, 'utf8');
  } catch (err) {
    log.fatal(`Failed to load file '${pathName}' with error: ${err.toString()}`);
  }

  try {
    return json5.parse(content);
  } catch (err) {
    log.fatal(`Failed to parse json file: '${pathName}': ${err.toString()}`);
  }
}

/**
 * We need to both load the config and resolve the paths it references based on
 * where the file is located.
 */
function loadAndResolveConfig(pathName: string): Config {
  debug('resolve', pathName);
  let config = requireConfig(pathName);

  // Resolve the plugin require paths...
  config.plugins = (config.plugins || []).reduce((list, entry) => {

    // Check if the plugin is referencing a path or a plugin name. If this is a
    // plugin name prefix it.
    if (entry.indexOf('/') === -1) {
      entry = `${PLUGIN_PREFIX}${entry}`;
    }

    let resolvedModule;
    try {
      debug('resolve module', entry);
      list.push(resolve.sync(entry, {
        basedir: path.dirname(pathName)
      }));
    } catch (err) {
      log.warn(err.message);
    }

    return list;

  }, []);

  return config;
}

// XXX: We likely want to figure out how to bundle/configure our cli with some
// default plugins and settings but that is for later...
const DEFAULT_CONFIG = {
  plugins: []
};

/**
 * Build up and resolve configuration files used in silk-cli.
 *
 * Merge Order:
 *
 *  - Project : .silkrc (resolved by walking up cwd)
 *  - Global  : .silkrc (~/.silk/.silkrc)
 *  - Default : DEFAULT_CONFIG
 */
export default function config(
  cwd = process.cwd(),
  global = GLOBAL_ROOT
): Config {

  let globalConfigPath = path.join(global, SILKRC);
  let globalConfig = { plugins: [] };
  if (fs.existsSync(globalConfigPath)) {
    globalConfig = loadAndResolveConfig(globalConfigPath);
  }
  let projectConfig = loadAndResolveConfig(path.resolve(lookup(SILKRC)));

  // Dedupe via Set.
  let plugins = Array.from(new Set([
    ...projectConfig.plugins,
    ...globalConfig.plugins,
    ...DEFAULT_CONFIG.plugins,
  ]));

  return {
    plugins
  }
}
