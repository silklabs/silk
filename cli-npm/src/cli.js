/**
 * @noflow
 */

/* eslint no-console: 0, no-process-exit: 0 */
import path from 'path';
import fs from 'fs';

import findPackages from '../../tools/npm/find_packages';
import {Packages, mergeDependencies} from './packages';

import type {PluginArgument} from 'silk-cli/src';
import type {PackageJSON} from './packages';

type FailConfig = {
  failSemver: boolean;
  failMissing: boolean;
  failMismatch: boolean;
};

// ROOT is the "root" of silk-core.
const ROOT = path.join(__dirname, '../..');
// We check only the first char... The string may contain things such as -beta
// but those come at the end... We are only trying to disallow semver ranges.
const FIRST_VERSION_CHAR = /[0-9]/;

// Hack to output list of dependencies except for these modules.
const LIST_IGNORE = new Set([
  path.join(__dirname, '../../pub', 'babel-preset-silk-node4'),
  path.join(__dirname, '../../pub', 'babelcompile'),
]);

const packages = new Packages(ROOT);


function logMissingPackage(name: string): void {
  console.warn(`Package '${name}' is not checked in.`);
}

function logVersionMismatch(
  name: string,
  pkg: PackageJSON,
  version: string
) {
  console.warn(`Package '${name}' does not match version in given package.json`);
  console.warn(`Current: '${pkg.version}' desired: '${version}'\n`);
}

function pkgArguments() {
  return [
    [['package'], {
      help: `Package name to upgrade`,
    }],
    [['version'], {
      help: `Version of the package to upgrade to`,
      type: (value: string) => {
        if (!checkSemverValue(value)) {
          throw new Error(`Version ${value} must not contain semver range`);
        }
        return value;
      },
    }],
  ];
}

// This cannot simply be a constant because argparse mutates options (ugh).
function pathArgument(): PluginArgument {
  return [['path'], {
    type: (input: string): string => {
      let cwd = path.resolve(input);
      let pkg = path.join(cwd, 'package.json');

      if (!fs.existsSync(pkg)) {
        throw new Error(`Given path does not contain a package.json ...`);
      }

      return pkg;
    },
    help: `Path to package to check if we have checked in all of it's dependencies.`,
  }];
}

function checkSemverValue(value: string): boolean {
  // If it contains a slash it's a git url or similar.
  if (value.indexOf('/') !== -1) {
    return true;
  }

  return FIRST_VERSION_CHAR.test(value[0]);
}

/**
 * Checks if given package has any semver flags... Emits a warning and returns
 * true if any of the packages use non-alpha (+ dot) chars.
 */
function warnOnSemver(dependencies: Map<string, string>): boolean {
  let result = false;
  for (let [name, version] of dependencies.entries()) {
    if (!checkSemverValue(version)) {
      console.warn(
        `Package '${name}' contains a semver fuzzy matcher '${version}'...`
      );
      result = true;
    }
  }
  return result;
}

function warnOnDepsCheck(
  opts: FailConfig,
  deps: Map<string, string>,
  globalPackages: Map<string, PackageJSON>,
): boolean {
  let failed = false;
  for (let [name, version] of deps.entries()) {
    let pkg = globalPackages.get(name);
    if (!pkg) {
      logMissingPackage(name);
      if (opts.failMissing) {
        failed = true;
      }
      // We want to log everything that is wrong rather than exit early.
      continue;
    }

    // Do not check version equality for git urls.
    if (version.indexOf('/') !== -1) {
      continue;
    }

    if (pkg.version !== version) {
      logVersionMismatch(name, pkg, version);
      // We do not want to use mismatched versions anywhere in the tree.
      if (opts.failMismatch) {
        failed = true;
      }
    }
  }

  return failed;
}

function validPackageContent(opts: FailConfig, pkg: PackageJSON): boolean {
  // Current module packages ...
  let deps = mergeDependencies(pkg);

  // Ensure package does not contain any fuzzy stuff ...
  if (warnOnSemver(deps) && opts.failSemver) {
    return false;
  }

  // Check to see if all the package versions are vendored.
  let silkGlobal = packages.currentPackages();
  if (warnOnDepsCheck(opts, deps, silkGlobal)) {
    return false;
  }

  return true;
}

export let check = {
  name: 'npm-pkg-check',
  help: `
    Check if package in tree has it's dependencies installed in node_modules.
  `,

  arguments: [pathArgument()],
  main: (args) => {
    // $FlowFixMe: require() calls should normally take literals.
    const pkg = require(args.path);
    // Fail on everything to provide best digagnostics.
    const opts = {
      failSemver: true,
      failMismatch: true,
      failMissing: true,
    };
    if (!validPackageContent(opts, pkg)) {
      process.exit(1);
    }
  },
};

export let listPkgs = {
  name: 'npm-pkg-list',
  help: 'List all dependencies of all packges in the path',
  arguments: [
    ['path', {
      type: (input) => {
        const cwd = path.resolve(input);
        if (!fs.existsSync(cwd)) {
          throw new Error(`Given path does not exist.`);
        }
        return cwd;
      },
      help: `Path to begin search in`,
    }],
    ['--pkg', {
      action: 'storeTrue',
      help: `Output a JSON friendly string for use with package.json.dependencies`,
      defaultValue: false,
    }],
  ],
  main: (args) => {
    const cwd = args.path;
    const modules = findPackages().filter((modulePath) => {
      return modulePath.indexOf(cwd) === 0;
    });

    const packages = {};

    for (let modulePath of modules) {

      if (LIST_IGNORE.has(modulePath)) {
        continue;
      }

      // $FlowFixMe: require() calls should normally take literals.
      const pkg = require(`${modulePath}/package.json`);
      const npmDeps = mergeDependencies(pkg);
      const symlinkDeps = pkg.symlinkDependencies || {};

      for (let [pkgName, version] of npmDeps.entries()) {
        packages[pkgName] = packages[pkgName] || {
          type: 'npm',
          versions: new Set(),
        };
        packages[pkgName].versions.add(version);
      }

      for (let pkgName in symlinkDeps) {
        packages[pkgName] = {
          type: 'symlink',
          versions: new Set(),
        };
      }
    }

    if (!args.pkg) {
      for (let pkgName in packages) {
        const pkgRef = packages[pkgName];
        const versions = Array.from(pkgRef.versions);
        const versionString = versions.length ? `: ${versions.join(', ')}` : '';
        console.log(`${pkgName} (${pkgRef.type}) ${versionString}`);
      }
    } else {
      const result = {};
      for (let pkgName in packages) {
        const pkgRef = packages[pkgName];
        if (pkgRef.type !== 'npm') {
          continue;
        }
        const versions = Array.from(pkgRef.versions);
        result[pkgName] = versions[0];
      }
      process.stdout.write(JSON.stringify(result, null, 2));
    }
  },
};

export let searchPkg = {
  name: 'npm-pkg-search',
  help: `Check if a package is used within the tree`,
  arguments: pkgArguments().slice(0, 1),
  main: async (args) => {
    const packages = findPackages();
    let hasPkg = false;

    for (let pkgDir of packages) {
      // $FlowFixMe: require() calls should normally take literals.
      const pkg = require(path.join(pkgDir, 'package.json'));
      const deps = mergeDependencies(pkg);
      const dep = deps.get(args.package);

      if (dep) {
        hasPkg = true;
        const warn = !checkSemverValue(dep);
        console.log(`${pkgDir} @ ${dep} ${warn ? '*' : ''}`);
      }
    }

    if (!hasPkg) {
      process.exit(1);
    }
  },
};

export let upgrade = {
  name: 'npm-pkg-upgrade',
  help: `Upgrade a dependency package across the entire tree`,
  arguments: pkgArguments(),
  main: async (args) => {
    const corePackages = findPackages();
    let hasPkg = false;

    for (let pkgDir of corePackages) {
      const pkgPath = path.join(pkgDir, 'package.json');
      // $FlowFixMe: require() calls should normally take literals.
      const pkg = require(pkgPath);
      let deps = null;

      if (pkg.dependencies && pkg.dependencies[args.package]) {
        deps = pkg.dependencies;
      }

      if (pkg.devDependencies && pkg.devDependencies[args.package]) {
        deps = pkg.devDependencies;
      }

      if (pkg.peerDependencies && pkg.peerDependencies[args.package]) {
        deps = pkg.peerDependencies;
      }

      if (deps) {
        console.log(`Will upgrade ${pkgDir}`);
        hasPkg = true;
        deps[args.package] = args.version;
        fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
      }
    }

    if (!hasPkg) {
      console.log(`No packages depend on ${args.package}`);
      process.exit(1);
    }

    if (hasPkg) {
      packages.npmInstall(packages.root, [{
        name: args.package,
        version: args.version,
        type: 'npm',
        // Always run full install on upgrade ...
        hasBin: false,
      }]);
    }
  },
};

export let install = {
  name: 'npm-install',
  help: `
    Install any dependencies not yet in global node_modules folder.
  `,
  arguments: [pathArgument()],
  main: async (args) => {
    // Note quite as fast as it could be as this will run some steps twice..
    // However it is much easier to manage this way.
    // $FlowFixMe: require() calls should normally take literals.
    const pkg = require(args.path);
    const opts = {
      // Do not allow semver ~, etc.. flags when installing...
      failSemver: true,
      // Fail on mismatch to prevent horrible errors from mismatching versions
      // of dependencies...
      failMismatch: true,
      // Do not fail when a package is missing.. We will install it.
      failMissing: false,
    };

    if (!validPackageContent(opts, pkg)) {
      process.exit(1);
    }

    let installed = await packages.install(path.dirname(args.path), pkg);
    for (const installPkg of installed) {
      console.log(`Install (${installPkg.type}) ${installPkg.name} @ ${installPkg.version}`);
    }

    console.log(`Installed : ${installed.length} packages`);
  },

};
