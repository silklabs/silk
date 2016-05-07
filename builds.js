/**
 * This defines all builds that might get run on PRs, pushes, and nightlies.
 *
 * A build is a JSON object that conforms to the `BuildConfig` type
 * defined in `lib/build-determinator.js`. To make it easier to define
 * a number of similar builds, and to allow commentary, this file is a
 * JS module.
 */
'use strict';

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

// TODO: This should live in pub/builds.js when releng can handle it.
//       However REPOCACHE_URLPREFIX should not be exposed, we'll need an
//       SOS URL version when this moves into pub/builds.js.
const oss = {
  'sos-bsp-gonk-linux-qemu-pr': {
    title: '(qemu) pub/bsp-gonk build and test',
    travis_yml: 'pub/bsp-gonk/travis/travis_linux.yml',
    branches: ['master'],
    cwd: 'pub/bsp-gonk',
    travis_config: {
      env: {
        global: [
          'GONK=qemu',
          'REPOCACHE_URLPREFIX=https://silk-releng-us-east-1.s3-external-1.amazonaws.com/master/repocache/',
        ],
      },
    },
    events: ['pr'],
    files: [
      'pub/bsp-gonk/**',
      'pub/device-main/**',
    ]
  },

  // TODO: This will evolve over time to do different things than the pr.
  'sos-bsp-gonk-linux-qemu-push': {
    'title': '(push) pub/bsp-gonk build and test',
    'travis_yml': 'pub/bsp-gonk/travis/travis_linux.yml',
    events: ['push'],
    branches: ['master', 'next', 'release'],
    cwd: 'pub/bsp-gonk',
    travis_config: {
      env: {
        global: [
          'GONK=qemu',
          'REPOCACHE_URLPREFIX=https://silk-releng-us-east-1.s3-external-1.amazonaws.com/master/repocache/',
        ],
      },
    },
    files: [
      'pub/bsp-gonk/**',
      'pub/device-main/**',
    ]
  },

  'sos-bsp-gonk-linux-qemu-nightly': nightlyBuild('pub/bsp-gonk', {
    'title': 'Nightly build for QEMU SoS',
    'travis_yml': 'pub/bsp-gonk/travis/travis_linux.yml',
    travis_config: {
      env: {
        global: [
          'GONK=qemu',
          'REPOCACHE_URLPREFIX=https://silk-releng-us-east-1.s3-external-1.amazonaws.com/master/repocache/',
        ],
      },
    }
  }),

  'sos-bsp-gonk-linux-mako-nightly': nightlyBuild('pub/bsp-gonk', {
    'title': 'Nightly build for Mako SoS',
    'travis_yml': 'pub/bsp-gonk/travis/travis_linux.yml',
    travis_config: {
      env: {
        global: [
          'GONK=mako',
          'REPOCACHE_URLPREFIX=https://silk-releng-us-east-1.s3-external-1.amazonaws.com/master/repocache/',
        ],
      },
    }
  }),

  'sos-bsp-gonk-kenzo-nightly': nightlyBuild('pub/bsp-gonk', {
    'title': 'Kenzo nightly for silk open source',
    'travis_yml': 'pub/bsp-gonk/travis/travis_linux.yml',
    travis_config: {
      env: {
        global: [
          'GONK=kenzo',
          'REPOCACHE_URLPREFIX=https://silk-releng-us-east-1.s3-external-1.amazonaws.com/master/repocache/',
        ],
      },
    },
  }),
}

const builds = {
  // Push and PR builds
  'api': npmPackageBuild('api'),
  'api-schema': npmPackageBuild('api-schema'),
  'azure-storage': npmPackageBuild('azure-storage'),
  'app-js-lint': npmPackageBuild('app', {
    // Always run lint when JS files change.
    travis_yml: 'app/.travis-lint.yml',
    files: [
      'app/.flowconfig',
      'app/.eslintrc',
      'app/**/*.js',
    ],
  }),
  'app-ios-pr': npmPackageBuild('app', {
    // On PRs only build the entire iOS app if relevant files changed.
    travis_yml: 'app/ios/.travis.yml',
    files: [
      'app/ios/**',
    ],
    events: ['pr'],
  }),
  'app-ios-push': npmPackageBuild('app', {
    // Always build the app on a branch push, no matter what changed.
    travis_yml: 'app/ios/.travis.yml',
    events: ['push'],
  }),
  'app-android-pr': npmPackageBuild('app', {
    // On PRs only build the entire Android app if relevant files changed.
    travis_yml: 'app/android/.travis.yml',
    files: [
      'app/android/**',
    ],
    events: ['pr'],
  }),
  'app-android-push': npmPackageBuild('app', {
    // Always build the app on a branch push, no matter what changed.
    travis_yml: 'app/android/.travis.yml',
    events: ['push'],
  }),
  'cam': npmPackageBuild('cam'),
  'cli': npmPackageBuild('pub/cli'),
  'cli-plugin-internal': npmPackageBuild('cli-plugin-internal'),
  'http': npmPackageBuild('http'),
  'log': npmPackageBuild('pub/log'),
  'sim': npmPackageBuild('sim', {
    files: [
      'device/**',
      'pub/bsp-gonk/**',
      'sim/**',
    ],
  }),
  'device-pr': npmPackageBuild('device', {
    // Build a quick "base" device build on PRs.
    package_json: 'device/vendor/silk/core/package.json',
    travis_config: {
      env: {
        global: ['GONK=base'],
      },
    },
    events: ['pr'],
    files: [
      'device/**',
      'pub/bsp-gonk/**',
    ],
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
    events: ['push'],
    files: [
      'device/**',
      'pub/bsp-gonk/**',
    ],
  }),
  'networktest': npmPackageBuild('networktest'),
  'releng': npmPackageBuild('releng'),
  'rtc': npmPackageBuild('rtc'),
  'server': npmPackageBuild('server'),
  'streams': npmPackageBuild('streams'),
  'utils': npmPackageBuild('utils'),
  'webapp-pr': npmPackageBuild('webapp', {
    events: ['pr'],
  }),
  'webapp-push': npmPackageBuild('webapp', {
    files: [
      'webapp/**',
      // These files feed into API documentation, redeploy webapp upon changes.
      'docs/**',
      'device/vendor/silk/core/lib/**/*.js',
    ],
    events: ['push'],
  }),
  // Disabled for now because it is teh broken.
  //'node_modules_cache': npmPackageBuild('tools/node_modules_cache', {
  //  files: ['**/package.json']
  //}),
  'mp4dash': npmPackageBuild('tools/mp4dash'),

  // Push open source changes immediately on committing to silk-core
  // Only master branch is pushed currently
  'pub-push': {
    title: 'Silk open source public push',
    travis_yml: 'releng/travis.pub-push.yml',
    events: ['push'],
    branches: ['master'],
    files: [
      'pub/**',
    ]
  },

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
  // TODO: Enable OS X device build once Travis OS X machines have more disk space,
  //       or the build is smaller :sadface:
  //
  //         > cp: error writing 'Release/opencv.node': No space left on device
  /*
  'device-osx-nightly': nightlyBuild('device', {
    title: 'OS X base nightly',
    travis_config: {
      os: ['osx'],
      env: {
        global: ['GONK=base'],
      },
    },
  }),
  */
  'device-base.msm8956-nightly': nightlyBuild('device', {
    branches: ['master', 'next'],
    title: 'base.msm8956 nightly',
    travis_config: {
      env: {
        global: ['GONK=base.msm8956'],
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
  'repocache-base': {
    title: 'Updating repocache for base',
    travis_yml: 'repocache/travis.yml',
    travis_config: {
      os: ['linux', 'osx'],
      env: {
        global: ['BOARD=base'],
      },
    },
    events: ['nightly'],
    branches: ['master'],
  },
  'repocache-base.kenzo': {
    title: 'Updating repocache for base.kenzo',
    travis_yml: 'repocache/travis.yml',
    travis_config: {
      os: ['linux', 'osx'],
      env: {
        global: ['BOARD=base.kenzo'],
      },
    },
    events: ['nightly'],
    branches: ['master'],
  },
  'repocache-mako-nightly': {
    title: 'Updating repocache for mako',
    travis_yml: 'repocache/travis.yml',
    travis_config: {
      env: {
        global: ['BOARD=mako'],
      },
    },
    events: ['nightly'],
    branches: ['master'],
  },
  'repocache-qemu-nightly': {
    title: 'Updating repocache for qemu',
    travis_yml: 'repocache/travis.yml',
    travis_config: {
      env: {
        global: ['BOARD=qemu'],
      },
    },
    events: ['nightly'],
    branches: ['master'],
  },
  'repocache-kenzo-gonkjs': {
    title: 'Updating repocache for kenzo/gonkjs',
    travis_yml: 'repocache/travis.yml',
    travis_config: {
      env: {
        global: [
          'BOARD=kenzo',
          'PRODUCT=gonkjs'
        ],
      },
    },
    events: ['nightly'],
    branches: ['master'],
  },
};

// Copy over the builds definition from SOS.
for (let key in oss) {
  if (!(key in builds)) {
    builds[key] = oss[key];
  } else {
    console.error(`OSS build attempting to override: ${key}`);
  }
}

module.exports = builds;
