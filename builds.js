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
 * Most of our in-tree npm packages only need to have 'npm test' run.
 * We can save a bunch of boiler plate by re-using the same Travis config.
 */
function runNpmTestForPackages(dirs) {
  return {
    travis_yml: '.npmtravis.yml',
    travis_config: {
      env: {
        matrix: dirs.map((dir) => 'NPM_PACKAGE_DIR="' + dir + '"'),
      },
    },
    files: dirs.map((dir) => path.join(dir, '**')),
    events: ['push', 'pr'],
    branches: ['master', 'next', 'release'],
  };
}

/**
 * Define a nightly build for Travis configuration file at
 * `<dir>/.travis.yml` which should assume that the CWD during the
 * build is `<dir>/`. The build is run for the master branch by
 * default.
 */
function nightlyBuild(dir, overrides) {
  const result = Object.assign({
    travis_yml: path.join(dir, '.travis.yml'),
    cwd: dir,
    events: ['nightly'],
    branches: ['master'],
  }, overrides);

  // ensure that travis_config has a basic setup.
  result.travis_config = result.travis_config || {};
  result.travis_config.env = result.travis_config.env || {};
  result.travis_config.env.global = result.travis_config.env.global || [];

  // Set the SILK_CHANNEL so nightlies are on a different path than normal
  // pushes.
  result.travis_config.env.global.push('SILK_CHANNEL=nightly');
  return result;
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
          'BOARD=qemu',
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
          'BOARD=qemu',
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
    title: 'Nightly build for QEMU SoS',
    travis_yml: 'pub/bsp-gonk/travis/travis_linux.yml',
    travis_config: {
      env: {
        global: [
          'BOARD=qemu',
          'REPOCACHE_URLPREFIX=https://silk-releng-us-east-1.s3-external-1.amazonaws.com/master/repocache/',
        ],
      },
    }
  }),

  'sos-bsp-gonk-darwin-null-qemu-nightly': nightlyBuild('pub/bsp-gonk', {
    title: 'Nightly build for Null QEMU SoS OSX',
    travis_yml: 'pub/bsp-gonk/travis/travis_darwin.yml',
    travis_config: {
      os: ['osx'],
      env: {
        global: [
          'BOARD=qemu',
          'PRODUCT=null',
          'REPOCACHE_URLPREFIX=https://silk-releng-us-east-1.s3-external-1.amazonaws.com/master/repocache/',
        ],
      },
    },
  }),

  'sos-bsp-gonk-linux-mako-nightly': nightlyBuild('pub/bsp-gonk', {
    'title': 'Nightly build for Mako SoS',
    'travis_yml': 'pub/bsp-gonk/travis/travis_linux.yml',
    travis_config: {
      env: {
        global: [
          'BOARD=mako',
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
          'BOARD=kenzo',
          'REPOCACHE_URLPREFIX=https://silk-releng-us-east-1.s3-external-1.amazonaws.com/master/repocache/',
        ],
      },
    },
  }),
}

const builds = {
  // Push and PR builds
  'flow': {
    travis_yml: '.flowtravis.yml',
    files: ['.flowconfig', '**/*.js', '**/*.json'],
    events: ['push', 'pr'],
    branches: ['master', 'next', 'release'],
  },
  'lint': {
    travis_yml: '.linttravis.yml',
    files: [
      'lint.sh',
      '**/.eslintrc',
      '**/.eslintignore',
      '**/*.js',
      '**/*.json',
    ],
    events: ['push', 'pr'],
    branches: ['master', 'next', 'release'],
  },

  'bob-device-pandohub-silkhub-userdebug': {
    title: '',
    travis_yml: 'bob/travis.yml',
    travis_config: {
      os: ['linux'],
      env: {
        global: [
          'BOB_BUILD_COMMAND=bob/device-pandohub-silkhub.sh',
          'BOB_BUILD_HOST=silksd.ddns.net',
          'BOB_BUILD_HOST_PORT=888',
        ],
      },
    },
    events: ['nightly'],
    branches: ['master', 'next', 'release'],
  },

  'bob-device-pandohub-fuhuhub-userdebug': {
    title: '',
    travis_yml: 'bob/travis.yml',
    travis_config: {
      os: ['linux'],
      env: {
        global: [
          'BOB_BUILD_COMMAND=bob/device-pandohub-fuhuhub.sh',
          'BOB_BUILD_HOST=silksd.ddns.net',
        ],
      },
    },
    events: ['nightly'],
    branches: ['next', 'release'],
  },

  'npm-dialog-test': runNpmTestForPackages([
    'dialog-engine',
    'dialog-script',
  ]),
  'npm-test': runNpmTestForPackages([
    'azure-storage',
    'api-schema',
    'cam',
    'cli-npm',
    'cli-plugin-internal',
    'fetch',
    'http-client',
    'mse-player',
    'pub/log',
    'pub/version',
    'react-native-transformer',
    'streams',
    'tools/mp4dash',
    'npm-extractor',
    'utils',
  ]),

  // TODO: bring back api CI tests once we workaround issues related to
  // interdeps with the server.
  //'api': npmPackageBuild('api'),

  // The React Native packager is fairly picky about duplicate packages in the
  // tree. Verify that the bundle still builds whenever package dependencies.
  'app-bundle': {
    travis_yml: 'app/.travis-bundle.yml',
    files: [
      'app/node_modules/**',
      '**/package.json',
      'node_modules/**',
      'rn-cli.config.js',
      'flow-interface/**',
    ],
    events: ['push', 'pr'],
    branches: ['master', 'next', 'release'],
  },
  'app-ios-debug': npmPackageBuild('app', {
    // Only build the iOS app if relevant files changed.
    travis_yml: 'app/ios/travis/debug.yml',
    files: [
      'rn-cli.config.js',
      'app/node_modules/**',
      'app/ios/**',
      'crypto/ios/**',
      'ble-socket/ios/**',
      'pub/react-native-blobs/ios/**',
      'react-native-webrtc/ios/**',
    ],
    events: ['pr', 'push', 'nightly'],
  }),
  'app-ios-release': npmPackageBuild('app', {
    travis_yml: 'app/ios/travis/release.yml',
    events: ['push', 'nightly'],
  }),
  'app-android-pr': npmPackageBuild('app', {
    // On PRs only build the entire Android app if relevant files changed.
    travis_yml: 'app/android/travis/release.yml',
    files: [
      'rn-cli.config.js',
      'app/node_modules/**',
      'app/android/**',
      'crypto/android/**',
      'ble-socket/android/**',
      'pub/react-native-blobs/android/**',
      'react-native-webrtc/android/**',
    ],
    events: ['pr'],
  }),
  'app-android-push': npmPackageBuild('app', {
    // Always build the app on a branch push, no matter what changed.
    travis_yml: 'app/android/travis/release.yml',
    events: ['push'],
  }),
  'app-sdk-ios': npmPackageBuild('app-sdk', {
    travis_yml: 'app-sdk-example/ios/.travis.yml',
    cwd: 'app-sdk-example',
    files: [
      'app-sdk-example/ios/**',
      'app-sdk/ios/**',
      'app-util/ios/**',
      'crypto/ios/**',
      'pub/react-native-blobs/ios/**',
      'react-native-webrtc/ios/**',
    ],
  }),
  'app-sdk-android': npmPackageBuild('app-sdk', {
    travis_yml: 'app-sdk-example/android/.travis.yml',
    cwd: 'app-sdk-example',
    files: [
      'app-sdk-example/android/**',
      'app-sdk/android/**',
      'app-util/android/**',
      'crypto/android/**',
      'pub/react-native-blobs/android/**',
      'react-native-webrtc/android/**',
    ],
  }),
  'cli': npmPackageBuild('pub/cli'),
  'crypto': npmPackageBuild('crypto'),
  'sim': npmPackageBuild('sim', {
    files: [
      'device/**',
      'pub/bsp-gonk/**',
      'sim/**',
    ],
  }),
  'device-base-mako-silk': npmPackageBuild('device', {
    package_json: 'device/vendor/silk/core/package.json',
    travis_config: {
      env: {
        global: [
          'BOARD=base',
          'PRODUCT=silk',
        ],
      },
    },
    events: ['pr'],
    files: [
      'device/**',
      'pub/bsp-gonk/**',
    ],
  }),
  'device-base-msm8909-silk': npmPackageBuild('device', {
    package_json: 'device/vendor/silk/core/package.json',
    travis_config: {
      env: {
        global: [
          'BOARD=base.msm8909',
          'PRODUCT=silk',
        ],
      },
    },
    events: ['pr'],
    files: [
      'device/**',
      'pub/bsp-gonk/**',
    ],
  }),
  'device-vendor-silk': npmPackageBuild('device', {
    package_json: 'device/vendor/silk/core/package.json',
    travis_yml: 'device/vendor/silk/travis/travis.yml',
    cwd: 'device/vendor/silk',
    events: ['pr'],
    files: [
      'device/vendor/silk/**',
      'device/vendor/propsilk/**',
      'pub/bsp-gonk/vendor/silk/**',
    ],
  }),
  'networktest': npmPackageBuild('networktest', {
    files: [
      'networktest/**',
      'server/**',
    ],
    events: ['pr', 'push', 'nightly'],
  }),
  'releng': npmPackageBuild('releng'),
  'rtc': npmPackageBuild('rtc', {
    files: [
      'rtc/**',
      'node-webrtc/**',
    ],
  }),
  'server': npmPackageBuild('server'),
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
  'node-webrtc-linux-build': npmPackageBuild('node-webrtc', {
    travis_yml: 'node-webrtc/travis/travis_linux.yml',
  }),
  'node-webrtc-linux-prebuilt': npmPackageBuild('node-webrtc', {
    travis_yml: 'node-webrtc/travis/travis_prebuilt_linux.yml',
  }),
  'node-webrtc-darwin-prebuilt': npmPackageBuild('node-webrtc', {
    travis_yml: 'node-webrtc/travis/travis_prebuilt_darwin.yml',
  }),
  // Push open source changes immediately on committing to silk-core
  // Only master branch is pushed currently
  'releng-shipit-pub-push': {
    title: 'Open Source /pub push',
    travis_yml: 'releng/shipit/travis.pub-push.yml',
    events: ['push'],
    branches: ['master'],
    files: [
      'pub/**',
    ]
  },

  // Pando releases runs on push (and nightly as backup)
  'releng-shipit-pando-app': {
    title: 'Pando app release',
    travis_yml: 'releng/shipit/travis.release-pando-app.yml',
    events: ['nightly', 'push'],
    files: [
      'app-client/**',
      'app-sdk/**',
      'ble-socket/**',
      'app-sdk-example/**',
       // TODO: Add more from the release-pando-app WHITELIST here
    ],
    branches: ['master', 'next', 'release'],
  },
  'releng-shipit-pando-dialog-script': {
    title: 'Pando dialog script release',
    travis_yml: 'releng/shipit/travis.release-pando-dialog-script.yml',
    events: ['nightly', 'pr', 'push'],
    files: ['dialog-script/**'],
    branches: ['master', 'next', 'release'],
  },
  'releng-shipit-internal-ota': {
    title: 'Internal OTA update',
    travis_yml: 'releng/shipit/travis.internal-ota.yml',
    events: ['nightly', 'pr'],
    files: [
      'releng/shipit/travis.internal-ota.yml',
      'releng/shipit/internal-ota',
    ],
    branches: ['master', 'next', 'release'],
  },

  // Nightly device builds
  'device-qemu-silk-userdebug': nightlyBuild('device', {
    branches: ['master', 'next'],
    title: 'qemu silk',
    travis_config: {
      env: {
        global: [
          'BOARD=qemu',
          'PRODUCT=silk',
        ],
      },
    },
    // Also rebuild this every time the base version changes to ensure that
    // subsequent PRs will have an up-to-date qemu image to test against.
    files: ['bsp-version/**'],
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
        global: [
          'BOARD=base',
          'PRODUCT=silk',
        ],
      },
    },
  }),
  */
  'device-mako-silk-userdebug': nightlyBuild('device', {
    branches: ['master', 'next', 'release'],
    title: 'mako silk',
    travis_config: {
      env: {
        global: [
          'BOARD=mako',
          'PRODUCT=silk',
        ],
      },
    },
  }),
  'device-kenzo-silk-userdebug': nightlyBuild('device', {
    branches: ['master', 'next', 'release'],
    title: 'kenzo silk',
    travis_config: {
      env: {
        global: [
          'BOARD=kenzo',
          'PRODUCT=silk',
        ],
      },
    },
  }),
  'device-kenzo-silkhub-userdebug': nightlyBuild('device', {
    branches: ['master', 'next', 'release'],
    title: 'kenzo silkhub userdebug',
    travis_config: {
      env: {
        global: [
          'BOARD=kenzo',
          'PRODUCT=silkhub',
        ],
      },
    },
  }),
  'device-kenzo-silkhub-user': nightlyBuild('device', {
    branches: ['master', 'next', 'release'],
    title: 'kenzo silkhub user',
    travis_config: {
      env: {
        global: [
          'BOARD=kenzo',
          'PRODUCT=silkhub',
          'NODE_ENV=production',
        ],
      },
    },
  }),
  'device-kenzo-fuhuhub-userdebug': nightlyBuild('device', {
    branches: ['master', 'next', 'release'],
    title: 'kenzo fuhuhub userdebug',
    travis_config: {
      env: {
        global: [
          'BOARD=kenzo',
          'PRODUCT=fuhuhub',
        ],
      },
    },
  }),
  'device-base.kenzo-silk': nightlyBuild('device', {
    branches: ['master', 'next'],
    title: 'base.kenzo silk',
    travis_config: {
      env: {
        global: [
          'BOARD=base.kenzo',
          'PRODUCT=silk',
        ],
      },
    },
  }),
  'device-base.msm8909-silk': nightlyBuild('device', {
    branches: ['master', 'next', 'release'],
    title: 'base.msm8909 silk',
    travis_config: {
      env: {
        global: [
          'BOARD=base.msm8909',
          'PRODUCT=silk',
        ],
      },
    },
  }),
  'device-base.msm8909-silkhub': nightlyBuild('device', {
    branches: ['master', 'next', 'release'],
    title: 'base.msm8909 silkhub',
    travis_config: {
      env: {
        global: [
          'BOARD=base.msm8909',
          'PRODUCT=silkhub',
        ],
      },
    },
  }),

  // Nightly repocache deploys to S3
  'repocache-base-silk': {
    title: 'Updating repocache for base silk',
    travis_yml: 'repocache/travis.yml',
    travis_config: {
      os: ['linux', 'osx'],
      env: {
        global: [
          'BOARD=base',
          'PRODUCT=silk',
        ],
      },
    },
    events: ['nightly'],
    branches: ['master'],
  },
  'repocache-base.msm8909 silk': {
    title: 'Updating repocache for base.msm8909 silk',
    travis_yml: 'repocache/travis.yml',
    travis_config: {
      os: ['linux', 'osx'],
      env: {
        global: [
          'BOARD=base.msm8909',
          'PRODUCT=silk',
        ],
      },
    },
    events: ['nightly'],
    branches: ['master'],
  },
  'repocache-msm8909-la121-silk': {
    title: 'Updating repocache for msm8909-la121 silk',
    travis_yml: 'repocache/travis.yml',
    travis_config: {
      os: ['linux'],
      env: {
        global: [
          'BOARD=msm8909-la121',
          'PRODUCT=silk',
        ],
      },
    },
    events: ['nightly'],
    branches: ['master'],
  },
  'repocache-base.kenzo-silk': {
    title: 'Updating repocache for base.kenzo silk',
    travis_yml: 'repocache/travis.yml',
    travis_config: {
      os: ['linux', 'osx'],
      env: {
        global: [
          'BOARD=base.kenzo',
          'PRODUCT=silk',
        ],
      },
    },
    events: ['nightly'],
    branches: ['master'],
  },
  'repocache-mako-silk': {
    title: 'Updating repocache for mako silk',
    travis_yml: 'repocache/travis.yml',
    travis_config: {
      env: {
        global: [
          'BOARD=mako',
          'PRODUCT=silk',
        ],
      },
    },
    events: ['nightly'],
    branches: ['master'],
  },
  'repocache-qemu-silk': {
    title: 'Updating repocache for qemu silk',
    travis_yml: 'repocache/travis.yml',
    travis_config: {
      env: {
        global: [
          'BOARD=qemu',
          'PRODUCT=silk',
        ],
      },
    },
    events: ['nightly'],
    branches: ['master'],
  },
  'repocache-qemu-gonkjs': {
    title: 'Updating repocache for qemu gonkjs',
    travis_yml: 'repocache/travis.yml',
    travis_config: {
      os: ['linux', 'osx'],
      env: {
        global: [
          'BOARD=qemu',
          'PRODUCT=gonkjs',
        ],
      },
    },
    events: ['nightly'],
    branches: ['master'],
  },
  'repocache-kenzo-gonkjs': {
    title: 'Updating repocache for kenzo gonkjs',
    travis_yml: 'repocache/travis.yml',
    travis_config: {
      env: {
        global: [
          'BOARD=kenzo',
          'PRODUCT=gonkjs',
        ],
      },
    },
    events: ['nightly'],
    branches: ['master'],
  },
  'repocache-kenzo-silk': {
    title: 'Updating repocache for kenzo silk',
    travis_yml: 'repocache/travis.yml',
    travis_config: {
      env: {
        global: [
          'BOARD=kenzo',
          'PRODUCT=silk',
        ],
      },
    },
    events: ['nightly'],
    branches: ['master'],
  },
  'repocache-pandohub-silkhub': {
    title: 'Updating repocache for pandohub/silkhub',
    travis_yml: 'repocache/travis.yml',
    travis_config: {
      env: {
        global: [
          'BOARD=pandohub',
          'PRODUCT=silkhub',
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
