/**
 * eslint rule that ensures every require()'d and imported package is declared
 * in package.json. It is based on import/no-extraneous-dependencies, but has
 * been extended to understand `symlinkDependencies`.
 */

const path = require('path');
const readPkgUp = require('read-pkg-up');
const minimatch = require('minimatch');

const importType = require('eslint-plugin-import/lib/core/importType').default;
const isStaticRequire = require('eslint-plugin-import/lib/core/staticRequire').default;

function getPackageContent(filename) {
  try {
    return readPkgUp.sync({cwd: filename, normalize: false}).pkg;
  } catch (e) {
    return null;
  }
}

const globalPkg = getPackageContent(path.join(__dirname, '../../'));

function getDependencies(packageContent) {
  return {
    dependencies: packageContent.dependencies || {},
    devDependencies: packageContent.devDependencies || {},
    optionalDependencies: packageContent.optionalDependencies || {},
    peerDependencies: packageContent.peerDependencies || {},
    symlinkDependencies: packageContent.symlinkDependencies || {},
  };
}

function findPackageInDependencies(packageName, packageContent) {
  const deps = getDependencies(packageContent);
  return [
    'dependencies',
    'devDependencies',
    'optionalDependencies',
    'peerDependencies',
    'symlinkDependencies',
  ].filter((depsName) => packageName in deps[depsName])[0];
}

function reportIfMissing(context, pkg, depsOptions, node, name) {
  if (importType(name, context) !== 'external') {
    return;
  }
  const splitName = name.split('/');
  const packageName = splitName[0][0] === '@'
    ? splitName.slice(0, 2).join('/')
    : splitName[0];
  const isSelf = packageName === pkg.name;

  const inWhichDeps = findPackageInDependencies(packageName, pkg);
  const deps = getDependencies(pkg);
  const isInDeps = deps.dependencies[packageName] !== undefined;
  const isInDevDeps = deps.devDependencies[packageName] !== undefined;
  const isInOptDeps = deps.optionalDependencies[packageName] !== undefined;
  const isInPeerDeps = deps.peerDependencies[packageName] !== undefined;
  const isInSymlinkDeps = deps.symlinkDependencies[packageName] !== undefined;

  if (isInDeps ||
    (depsOptions.allowSelf && isSelf) ||
    (depsOptions.allowDevDeps && inWhichDeps === 'devDependencies') ||
    (depsOptions.allowPeerDeps && inWhichDeps === 'peerDependencies') ||
    (depsOptions.allowSymlinkDeps && inWhichDeps === 'symlinkDependencies') ||
    (depsOptions.allowOptDeps && inWhichDeps === 'optionalDependencies')
  ) {
    return;
  }

  let destination = 'dependencies';
  if (globalPkg) {
    destination = findPackageInDependencies(packageName, globalPkg) || destination;
  }

  if (inWhichDeps === 'devDependencies' && !depsOptions.allowDevDeps) {
    context.report({
      node,
      message:
        `'${packageName}' should be listed in the project's ${destination}, ` +
        `not devDependencies.`,
    });
    return;
  }

  if (inWhichDeps === 'optionalDependencies' && !depsOptions.allowOptDeps) {
    context.report({
      node,
      message:
        `'${packageName}' should be listed in the project's ${destination}, ` +
        `not optionalDependencies.`,
    });
    return;
  }

  if (inWhichDeps === 'symlinkDependencies' && !depsOptions.allowSymlinkDeps) {
    context.report({
      node,
      message:
        `'${packageName}' should be listed in the project's ${destination}, ` +
        `not symlinkDependencies.`,
    });
    return;
  }

  context.report({
    node,
    message:
      `'${packageName}' should be listed in the project's ${destination}.`,
  });
}

function testConfig(config, filename) {
  // Simplest configuration first, either a boolean or nothing.
  if (typeof config === 'boolean' || typeof config === 'undefined') {
    return config;
  }
  // Array of globs.
  return config.some(c => (
    minimatch(filename, c) ||
    minimatch(filename, path.join(process.cwd(), c))
  ));
}

module.exports = {
  meta: {
    docs: {},

    schema: [
      {
        'type': 'object',
        'properties': {
          'allowSelf': { 'type': 'boolean' },
          'devDependencies': { 'type': ['boolean', 'array'] },
          'optionalDependencies': { 'type': ['boolean', 'array'] },
          'peerDependencies': { 'type': ['boolean', 'array'] },
          'symlinkDependencies': { 'type': ['boolean', 'array'] },
        },
        'additionalProperties': false,
      },
    ],
  },

  create(context) {
    const options = context.options[0] || {};
    const filename = context.getFilename();
    const pkg = getPackageContent(filename);

    if (!pkg) {
      return {};
    }

    const depsOptions = {
      allowSelf: !!options.allowSelf,
      allowDevDeps: testConfig(options.devDependencies, filename) !== false,
      allowOptDeps: testConfig(options.optionalDependencies, filename) !== false,
      allowPeerDeps: testConfig(options.peerDependencies, filename) !== false,
      allowSymlinkDeps: testConfig(options.symlinkDependencies, filename) !== false,
    };

    // todo: use module visitor from module-utils core
    return {
      ImportDeclaration: function (node) {
        reportIfMissing(context, pkg, depsOptions, node, node.source.value);
      },
      CallExpression: function handleRequires(node) {
        if (isStaticRequire(node)) {
          reportIfMissing(context, pkg, depsOptions, node, node.arguments[0].value);
        }
      },
    };
  },
};
