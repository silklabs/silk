/**
 * @flow
 */

import assert from 'assert';

import './mock-github';
import { determineBuildsForEvent } from '../lib/build-determinator';

suite('build determinator', () => {

  const validGithubUser = {
    login: 'silk-stooge',
  };

  const invalidGithubUser = {
    login: 'istealallthepasswords',
  };

  test('simple push to one project', async () => {
    let event = {
      type: 'push',
      sha: 'abcdef',
      branch: 'master',
      filesChanged: ['webapp/index.js'],
      githubUser: validGithubUser,
    };
    let builds = await determineBuildsForEvent('silklabs', 'repo', event);
    assert.strictEqual(builds.length, 1);
    assert.strictEqual(builds[0].name, 'webapp');
  });

  test('simple push to multiple projects', async () => {
    let event = {
      type: 'push',
      sha: 'abcdef',
      branch: 'master',
      filesChanged: ['webapp/index.js', 'server/index.js'],
      githubUser: validGithubUser,
    };
    let builds = await determineBuildsForEvent('silklabs', 'repo', event);
    assert.strictEqual(builds.length, 2);
    let buildNames = builds.map((build) => build.name).sort();
    assert.deepEqual(buildNames, ['server', 'webapp']);
  });

  test(`push to project that's a dependency of other projects`, async () => {
    let event = {
      type: 'push',
      sha: 'abcdef',
      branch: 'master',
      filesChanged: ['api/index.js'],
      githubUser: validGithubUser,
    };
    let builds = await determineBuildsForEvent('silklabs', 'repo', event);
    assert.equal(builds.length, 4);
    let buildNames = builds.map((build) => build.name).sort();
    assert.deepEqual(buildNames, ['api', 'app-build-push', 'app-lint', 'webapp']);
  });

  test('build that gets skipped on certain PRs, but never on push', async () => {
    let event = {
      type: 'pr',
      sha: 'abcdef',
      branch: 'master',
      filesChanged: ['app/src/libraries/crypto.js'],
      githubUser: validGithubUser,
    };
    let builds = await determineBuildsForEvent('silklabs', 'repo', event);
    assert.equal(builds.length, 1);
    assert.strictEqual(builds[0].name, 'app-lint');

    // The same changes as a push would trigger a full build, though.
    event.type = 'push';
    builds = await determineBuildsForEvent('silklabs', 'repo', event);
    assert.equal(builds.length, 2);
    let buildNames = builds.map((build) => build.name).sort();
    assert.deepEqual(buildNames, ['app-build-push', 'app-lint']);
  });

  test(`push to branch that doesn't get built`, async () => {
    let event = {
      type: 'push',
      sha: 'abcdef',
      branch: 'test',
      filesChanged: ['webapp/index.js'],
      githubUser: validGithubUser,
    };
    let builds = await determineBuildsForEvent('silklabs', 'repo', event);
    assert.strictEqual(builds.length, 0);
  });

  test('change to Travis configuration and package.json triggers build', async () => {
    let event = {
      type: 'push',
      sha: 'abcdef',
      branch: 'master',
      filesChanged: ['webapp/.travis.yml'],
      githubUser: validGithubUser,
    };
    let builds = await determineBuildsForEvent('silklabs', 'repo', event);
    assert.strictEqual(builds.length, 1);
    assert.strictEqual(builds[0].name, 'webapp');

    event.filesChanged = ['server/package.json'];
    builds = await determineBuildsForEvent('silklabs', 'repo', event);
    assert.strictEqual(builds.length, 1);
    assert.strictEqual(builds[0].name, 'server');
  });

  test('build without file dependencies', async () => {
    let event = {
      type: 'nightly',
      sha: 'abcdef',
      branch: 'master',
      githubUser: validGithubUser,
    };
    let builds = await determineBuildsForEvent('silklabs', 'repo', event);
    assert.strictEqual(builds.length, 1);
    assert.strictEqual(builds[0].name, 'device-nightly');
  });

  test('determine builds by name wildcard', async () => {
    let event = {
      name: 'app-*',
      sha: 'abcdef',
      branch: 'master',
      githubUser: validGithubUser,
    };
    let builds = await determineBuildsForEvent('silklabs', 'repo', event);
    let buildNames = builds.map((build) => build.name).sort();
    assert.deepEqual(buildNames, ['app-build-pr', 'app-build-push', 'app-lint']);
  });

  test('non member edit builds.js send', async () => {
    let event = {
      type: 'push',
      sha: 'abcdef',
      branch: 'master',
      filesChanged: ['webapp/index.js', 'builds.js'],
      githubUser: invalidGithubUser,
    };
    try {
      await determineBuildsForEvent('silklabs', 'repo', event);
    } catch (err) {
      if (err.message.indexOf('silklabs') === -1) {
        throw new Error(`Error message must contain repo owner: ${err.stack}`);
      }
      return;
    }
    throw new Error(`non member edit of builds.js should throw`);
  });

  test('simple push to dotfile', async () => {
    let event = {
      type: 'push',
      sha: 'abcdef',
      branch: 'master',
      filesChanged: ['webapp/.travis/script'],
      githubUser: validGithubUser,
    };
    let builds = await determineBuildsForEvent('silklabs', 'repo', event);
    assert.strictEqual(builds.length, 1);
    assert.strictEqual(builds[0].name, 'webapp');
  });

});
