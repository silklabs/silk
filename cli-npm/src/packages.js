/**
 * Contains various abstractions for reading/writing to our central node_modules
 * folder.
 *
 * @flow
 */

import invariant from 'assert';
import path from 'path';
import fs from 'fs';

import createLog from 'silk-log';
import mkdirp from 'mkdirp';

const DEP_TYPES = new Set([
  'devDependencies',
  'dependencies',
  'optionalDependencies',
]);

// This must point to the root of silk-core.
const ROOT = path.join(__dirname, '../../');

const log = createLog('cli-npm');

// TODO: Add a decl for this somewhere re-useable.
export type PackageJSON = {
  version: string;

  devDependencies?: {[key: string]: string};
  dependencies?: {[key: string]: string};
  symlinkDependencies?: {[key: string]: string};
};

export type MissingPackage = {
  type: 'npm' | 'symlink';
  version: string;
  name: string;
  hasBin: boolean;
};

/**
 * Creates a symlink in the given dir/name combination to a path.
 */
function symlink(cwd: string, name: string, target: string) {
  log.info(`symlink (${cwd}) ${name} -> ${target}`);
  invariant(!path.isAbsolute(target), 'symlink target must be a relative path');

  const currentCWD = process.cwd();
  process.chdir(cwd);
  // $FlowFixMe: flow does not understand the 2 argument form.
  fs.symlinkSync(target, name);
  process.chdir(currentCWD);
}

function getReadlink(path: string): ?string {
  try {
    return fs.readlinkSync(path);
  } catch (err) {
    return null;
  }
}

/**
 * symlinkDependencies when given an absolute path are relative to the root of silk
 * core otherwise relative to their package root.
 */
function resolveCorePath(cwd, dependencyPath) {
  if (path.isAbsolute(dependencyPath)) {
    return path.join(ROOT, dependencyPath);
  }
  // Re-map the relative path to be relative to the node_modules folder of the pkg.
  return path.resolve(cwd, dependencyPath);
}

export function mergeDependencies(pkg: PackageJSON): Map<string, string> {
  let result = new Map();

  for (let type of DEP_TYPES) {
    let dependencies = pkg[type];
    if (dependencies) {
      for (let name in dependencies) {
        let version = dependencies[name];
        result.set(name, version);
      }
    }
  }

  const symlinkDeps = pkg.symlinkDependencies || {};
  for (let dep in symlinkDeps) {
    result.delete(dep);
  }

  return result;
}

let _npm;
function getNPM() {
  if (_npm) {
    return _npm;
  }
  _npm = new Promise((accept, reject) => {
    // $FlowFixMe: dynamic require.
    let npm = require('npm/lib/npm');
    npm.load({}, (err) => {
      if (err) {
        reject(err);
        return;
      }
      accept(npm);
    });
  });
  return _npm;
}

export class Packages {
  root: string;
  nodeModulesPath: string;

  // Versions of the currently installed node modules.
  _versions: ?Map<string, PackageJSON>;

  constructor(root: string) {
    const nodeModulesPath = path.join(root, 'node_modules');
    invariant(fs.existsSync(nodeModulesPath));
    this.root = root;
    this.nodeModulesPath = nodeModulesPath;
  }

  /**
   * Load all current package metadata into memory.
   */
  currentPackages(): Map<string, PackageJSON> {
    if (this._versions) {
      return this._versions;
    }

    const pkgs = fs.readdirSync(this.nodeModulesPath);
    let versions = new Map();

    for (let pkg of pkgs) {
      let jsonPath = path.join(this.nodeModulesPath, pkg, 'package.json');
      if (!fs.existsSync(jsonPath)) {
        continue;
      }

      // $FlowFixMe: dynamic require.
      let details = require(jsonPath);
      versions.set(pkg, details);
    }

    this._versions = versions;
    return versions;
  }

  async _missingNpmPackages(pkg: PackageJSON): Promise<Array<MissingPackage>> {
    // Use npm api directly for best control...
    let current = this.currentPackages();

    let deps = mergeDependencies(pkg);

    // Compute the list of installs to run ...
    return Array.from(deps.entries()).reduce((list, entry) => {
      let [name, version] = entry;
      // XXX: In theory we should add some additional error checking here but
      // the cli layer does that right now.

      const depPkg = current.get(name);
      let hasBin = false;

      // Already have this package ...
      if (depPkg) {
        log.info(`NPM Package ${name} already exists ...`);
        if (!depPkg.bin) {
          return list;
        }
        hasBin = true;
      }

      list.push({ name, version, type: 'npm', hasBin });
      return list;
    }, []);
  }

  async _missingSymlinkPackages(cwd: string, pkg: PackageJSON): Promise<Array<MissingPackage>> {
    if (!pkg.symlinkDependencies) {
      return [];
    }

    const result = [];

    for (let name in pkg.symlinkDependencies) {
      // "version" is the path to the module in tree...
      const version = resolveCorePath(
        cwd,
        pkg.symlinkDependencies[name]
      );

      const dest = path.join(this.nodeModulesPath, name);
      const readlink = getReadlink(dest);
      // $FlowFixMe: Dynamic require...
      const depPkg = require(path.join(version, 'package.json'));
      const hasBin = !!depPkg.bin;

      if (readlink) {
        const absPath = path.join(this.nodeModulesPath, readlink);
        if (absPath !== version) {
          throw new Error(`Tried to re-symlink ${dest} (currently: ${absPath}) to ${version}`);
        }
        // we have a symlink and it is pointing in the right direction.
        log.info(`${name} has already been installed ...`);

        // We want to re-symlink the .bin files when we run install.
        if (!hasBin) {
          continue;
        }
      }

      log.info(`Will symlink ${version} into ${dest}`);
      result.push({
        name,
        version,
        type: 'symlink',
        hasBin,
      });
    }

    return result;
  }

  async missingPackages(cwd: string, pkg: PackageJSON): Promise<Array<MissingPackage>> {
    const results = await Promise.all([
      this._missingNpmPackages(pkg),
      this._missingSymlinkPackages(cwd, pkg),
    ]);

    // flatten ...
    return results.reduce((result, value) => {
      return result.concat(value);
    }, []);
  }

  _npmInstall(npm: any, list: Array<MissingPackage>): Promise<void> {
    return new Promise((accept, reject) => {
      const npmInstallList = list.map(pkg => `${pkg.name}@${pkg.version}`);

      npm.commands.install(this.root, npmInstallList, (err) => {
        if (err) {
          reject(err);
          return;
        }

        let globalPkgPath = path.join(this.nodeModulesPath, '../package.json');
        // $FlowFixMe: Dynamic require ...
        let globalPkg = require(globalPkgPath);
        globalPkg.dependencies = globalPkg.dependencies || {};

        for (let pkg of list) {
          globalPkg.dependencies[pkg.name] = pkg.version;
        }
        fs.writeFileSync(globalPkgPath, JSON.stringify(globalPkg, null, 2));
        accept();
      });
    });
  }

  async npmInstall(cwd: string, list: Array<MissingPackage>): Promise<void> {
    const installList = list.reduce((result, value) => {
      if (!value.hasBin) {
        result.push(value);
      }
      return result;
    }, []);

    if (installList.length) {
      const npm = await getNPM();
      await this._npmInstall(npm, installList);
    }

    for (let pkg of list) {
      const pathToResolve = `${pkg.name}/package.json`;
      // package.json can be used to resolve the actual root in the
      // node_modules folder ...
      const pkgRoot =
        path.dirname(require.resolve(pathToResolve));
      this.linkBinPaths(cwd, pkgRoot);
    }
  }

  linkBinPaths(cwd: string, packageRoot: string) {
    const packagePath = path.join(packageRoot, 'package.json');
    const modulePathBin = path.join(cwd, 'node_modules/.bin');
    if (!fs.existsSync(modulePathBin)) {
      mkdirp.sync(modulePathBin);
    }

    // $FlowFixMe: dynamic require ...
    const pkg = require(packagePath);

    if (pkg.bin) {
      for (let binName in pkg.bin) {
        const binAbsPath = path.join(packageRoot, pkg.bin[binName]);
        const binRelativePath = path.relative(modulePathBin, binAbsPath);
        try {
          fs.unlinkSync(path.join(modulePathBin, binName));
        } catch (err) {
          // ... ignore errors ...
        }
        symlink(modulePathBin, binName, binRelativePath);
        log.info(`(bin link) ${modulePathBin}/${binName} -> ${binRelativePath}`);
      }
    }
  }

  // XXX: This method uses sync api calls but is marked async for consistency and no other reason.
  async symlinkInstall(cwd: string, list: Array<MissingPackage>): Promise<void> {
    for (let pkg of list) {
      const depPkgPath = path.join(pkg.version, 'package.json');
      if (!fs.existsSync(depPkgPath)) {
        throw new Error(`Dependency ${pkg.name} does not have a pacakge.json at ${depPkgPath}`);
      }

      const relativePath = path.relative(this.nodeModulesPath, pkg.version);
      // symlink the whole module into node_modules directory ...
      if (!pkg.hasBin) {
        symlink(this.nodeModulesPath, pkg.name, relativePath);
      }
      this.linkBinPaths(cwd, pkg.version);
    }
  }

  /**
   * NOTE: This function assumes that the input package given contains no semver
   * and does not conflict with existing versions of packages.
   */
  async install(cwd: string, pkg: PackageJSON): Promise<Array<MissingPackage>> {
    // Use npm api directly for best control...
    let installs = await this.missingPackages(cwd, pkg);

    const ops = [];
    const groups = installs.reduce((current, value) => {
      log.info(`Will install (${value.type}) ${value.name} @ ${value.version}`);
      current[value.type].push(value);
      return current;
    }, {
      symlink: [],
      npm: [],
    });

    if (groups.npm.length) {
      ops.push(this.npmInstall(cwd, groups.npm));
    }

    if (groups.symlink.length) {
      ops.push(this.symlinkInstall(cwd, groups.symlink));
    }

    await Promise.all(ops);
    return installs;
  }
}
