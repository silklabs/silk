/**
 * Utility for extracting modules from <CORE>/node_modules into a destination
 * folder. This is intended for use cases such as a server deployment in which
 * we want/need to deploy some of the node_modules.
 *
 * @flow
 */

import path from 'path';
import resolve from 'resolve';
import { ncp } from 'ncp';
import mkdirp from 'mkdirp-promise';

function ncpPromise(source: string, dest: string, options: ?Object): Promise<void> {
  return new Promise((accept, reject) => {
    ncp(source, dest, options, (err, result) => {
      if (err) {
        reject(err);
        return;
      }
      accept(result);
    });
  });
}

function walkDependencies(
  // The resolve root.
  basedir: string,
  // Name of the module.
  packageName: string,
  // The path of the module in which this module has been required.
  parent: ?string,
  // The found module paths will be stored here ...
  modulePaths: Set<string>,
  // Internal state to keep track of paths previously searched.
  seen: Set<string> = new Set(),
): void {
  // We use a trick here by resolving the package.json to figure out where the
  // module root may be.
  const moduleName = path.join(packageName, 'package.json');
  const location = resolve.sync(moduleName, { basedir });

  if (!location) {
    throw new Error(`Failed to resolve '${packageName}' from ${basedir}`);
  }

  // XXX: We should not need symlink support here but this may explode if we do
  // need to resolve symlinks...
  const packageRoot = path.dirname(location);
  if (seen.has(packageRoot)) {
    return;
  }
  seen.add(packageRoot);

  // We try to handle this edge case where the module is actually inside it's
  // parent... If this is the case we do not add the path as copying the parent
  // is actually enough.

  if (!parent) {
    modulePaths.add(packageRoot);
  } else {
    const parentModuleRoot = path.join(parent, 'node_modules');
    if (packageRoot.indexOf(parentModuleRoot) !== 0) {
      modulePaths.add(packageRoot);
    }
  }

  // Load the dependencies and resolve those too ...
  // $FlowFixMe: ignore dynamic require ...
  const pkg = require(location);

  const dependencies = pkg.dependencies || {};
  for (let depName in dependencies) {
    walkDependencies(packageRoot, depName, packageRoot, modulePaths, seen);
  }
}

export default async function extract(
  // Starting root path (this should be core generally)
  startingRoot: string,
  modules: Array<string>,
  destination: string,
): Promise<void> {
  const modulePaths = new Set();
  // Doing this whole thing sync may seem weird but it generally is faster when
  // node does not need to be doing other things at the same time.
  for (let module of modules) {
    walkDependencies(startingRoot, module, null, modulePaths);
  }

  const nodeModulePath = path.join(startingRoot, 'node_modules');

  await mkdirp(destination);
  for (let modulePath of modulePaths) {
    const relativePath = path.relative(nodeModulePath, modulePath);
    await ncpPromise(modulePath, path.join(destination, relativePath), {});
  }
}
