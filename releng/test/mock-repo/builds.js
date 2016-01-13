const path = require('path');

function npmPackageBuild(dir, overrides) {
  return Object.assign({
    'travis_yml': path.join(dir, '.travis.yml'),
    'cwd': dir,
    'package_json': path.join(dir, 'package.json'),
    'files': [path.join(dir, '**')],
    'events': ['push', 'pr'],
    'branches': ['master', 'next', 'release'],
  }, overrides);
}

module.exports = {
  // Example of a straight-forward npm package build.
  'api': npmPackageBuild('api'),
  'webapp': npmPackageBuild('webapp'),
  'server': npmPackageBuild('server'),
  'app-lint': npmPackageBuild('app', {
    // Always run lint when JS files change.
    'travis_yml': 'app/.travis/lint.yml',
    'files': ['app/**/*.js'],
  }),
  'app-build-pr': npmPackageBuild('app', {
     // On PRs only build the entire app if non-JS files changed.
    'ignore_files': ['app/**/*.js'],
    'events': ['pr'],
  }),
  'app-build-push': npmPackageBuild('app', {
    // Always build the app on a branch push, no matter what changed.
    'events': ['push'],
  }),
};
