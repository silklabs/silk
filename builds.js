/**
 * This defines all builds that might get run on PRs, pushes, and nightlies.
 *
 * A build is a JSON object that conforms to the `BuildConfig` type
 * defined in `lib/build-determinator.js`. To make it easier to define
 * a number of similar builds, and to allow commentary, this file is a
 * JS module.
 */

const path = require('path');

/**
 * Define a build for an npm package that's resides in `<dir>/` and
 * has `<dir>/package.json` and `<dir>/.travis.yml files. The Travis
 * configuration assumes that the CWD during the build is `<dir>/`.
 * The build is triggered on PRs and push events by default.
 */
function npmPackageBuild(dir, overrides) {
  return Object.assign({
    travis_yml: path.join(dir, '.travis.yml'),
    cwd: dir,
    package_json: path.join(dir, 'package.json'),
    files: [path.join(dir, '**')],
    events: ['push', 'pr'],
    branches: ['master', 'next', 'release'],
  }, overrides);
}

/**
 * Define a nightly build for Travis configuration file at
 * `<dir>/.travis.yml` which should assume that the CWD during the
 * build is `<dir>/`. The build is run for the master branch by
 * default.
 */
function nightlyBuild(dir, overrides) {
  return Object.assign({
    travis_yml: path.join(dir, '.travis.yml'),
    cwd: dir,
    events: ['nightly'],
    branches: ['master'],
  }, overrides);
}

module.exports = {
  // Push and PR builds
  'api': npmPackageBuild('api'),
  'api-schema': npmPackageBuild('api-schema'),
  'app-lint': npmPackageBuild('app', {
    // Always run lint when JS files change.
    travis_yml: 'app/.travis/lint.yml',
    files: [
      'app/.flowconfig',
      'app/.eslintrc',
      'app/**/*.js',
    ],
  }),
  'app-pr': npmPackageBuild('app', {
     // On PRs only build the entire app if non-JS files changed.
    ignore_files: [
      'app/.flowconfig',
      'app/.eslintrc',
      'app/**/*.js',
    ],
    events: ['pr'],
  }),
  'app-push': npmPackageBuild('app', {
    // Always build the app on a branch push, no matter what changed.
    events: ['push'],
  }),
  'cli': npmPackageBuild('cli'),
  'device-pr': npmPackageBuild('device', {
    // Build a quick "base" device build on PRs.
    package_json: 'device/vendor/silk/core/package.json',
    travis_config: {
      env: {
        global: ['GONK=base'],
      },
    },
    events: ['pr'],
  }),
  'device-push': npmPackageBuild('device', {
    // Build the primary development device on a branch push.
    // Secondary devices are built nightly (see below.)
    package_json: 'device/vendor/silk/core/package.json',
    travis_config: {
      env: {
        global: ['GONK=mako'],
      },
    },
    ignore_files: [
      'device/repocache/**/*',
    ],
    events: ['push'],
  }),
  'networktest': npmPackageBuild('networktest'),
  'releng': npmPackageBuild('releng'),
  'server': npmPackageBuild('server'),
  'webapp': npmPackageBuild('webapp'),

  // Nightly device builds
  'device-qemu-nightly': nightlyBuild('device', {
    branches: ['master', 'next'],
    title: 'qemu nightly',
    travis_config: {
      env: {
        global: ['GONK=qemu'],
      },
    },
    // Also rebuild this every time the base version changes to ensure that
    // subsequent PRs will have an up-to-date qemu image to test against.
    files: ['device/vendor/silk/core/lib/base_version.js'],
    events: ['nightly', 'push'],
  }),
  'device-hammerhead-nightly': nightlyBuild('device', {
    title: 'hammerhead nightly',
    travis_config: {
      env: {
        global: ['GONK=hammerhead'],
      },
    },
  }),
  'device-osx-nightly': nightlyBuild('device', {
    title: 'OS X base nightly',
    travis_config: {
      env: {
        global: ['GONK=base'],
      },
    },
  }),
  'device-base.msm8916-nightly': nightlyBuild('device', {
    branches: ['master', 'next'],
    title: 'base.msm8916 nightly',
    travis_config: {
      env: {
        global: ['GONK=base.msm8916'],
      },
    },
  }),

  // Nightly repocache deploys to S3
  'repocache-base-nightly': {
    title: 'Updating repocache for base gonk',
    travis_yml: 'device/repocache/travis.yml',
    travis_config: {
      os: ['linux', 'osx'],
      env: {
        global: ['GONK=base'],
      },
    },
    events: ['nightly'],
    branches: ['master'],
  },
  'repocache-mako-nightly': {
    title: 'Updating repocache for mako gonk',
    travis_yml: 'device/repocache/travis.yml',
    travis_config: {
      env: {
        global: ['GONK=mako'],
      },
    },
    events: ['nightly'],
    branches: ['master'],
  },
  'repocache-hammerhead-nightly': {
    title: 'Updating repocache for hammerhead gonk',
    travis_yml: 'device/repocache/travis.yml',
    travis_config: {
      env: {
        global: ['GONK=hammerhead'],
      },
    },
    events: ['nightly'],
    branches: ['master'],
  },
  'repocache-qemu-nightly': {
    title: 'Updating repocache for qemu gonk',
    travis_yml: 'device/repocache/travis.yml',
    travis_config: {
      env: {
        global: ['GONK=qemu'],
      },
    },
    events: ['nightly'],
    branches: ['master'],
  },
};
