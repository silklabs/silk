/**
 * Machinery to determine which builds to trigger given a set of parameters
 *
 * @flow
 */

import invariant from 'assert';
import path from 'path';
import minimatch from 'minimatch';
import requireFromString from 'require-from-string';

import {
  readFileAtCommit,
  makeGitHubLog,
} from './github';

import type { TravisBuildConfig } from './travis';

export type EventType = 'push' | 'pr' | 'nightly';
export type BuildConfig = {
  name: string;
  title?: string;
  travis_yml: string;
  travis_config?: TravisBuildConfig;
  cwd?: string;
  package_json?: string;
  files?: Array<string>;
  ignore_files?: Array<string>;
  events?: Array<EventType>;
  branches?: Array<string>;
};
export type BuildTriggerEvent = {
  type: EventType;
  sha: string;
  branch: string;
  filesChanged: Array<string>;
};

const LOG_PREFIX = 'build-determinator';

/**
 * For a given build, look at dependencies declared in package.json
 * and determine any additional files that, when changed, should
 * trigger that build.
 */
async function resolveBuildDependencies(
  owner_name: string,
  repo_name: string,
  sha: string,
  build: BuildConfig
): Promise<void> {
  const log = makeGitHubLog(LOG_PREFIX, owner_name, repo_name, sha);
  if (!build.package_json) {
    log.info(`Build '${build.name}' does not specify a package.json file.`);
    return;
  }

  let package_json = await readFileAtCommit(
    owner_name,
    repo_name,
    sha,
    build.package_json
  );
  if (!package_json) {
    log.info(`Could not read ${build.package_json} for build '${build.name}'.`);
    return;
  }

  let package_config = JSON.parse(package_json);
  let localDeps = package_config.silkDependencies;
  if (!localDeps) {
    log.info(`${build.package_json} does not define any silkDependencies.`);
    return;
  }

  if (!build.files) {
    build.files = [];
  }
  for (let packageName in localDeps) {
    let depPath = localDeps[packageName];
    let absPath;
    if (depPath[0] === '/') {
      absPath = depPath.slice(1);
    } else {
      invariant(build.package_json);
      absPath = path.resolve(build.package_json, depPath);
    }
    build.files.push(absPath + '/**');
  }
}

/**
 * Return true if `file` matches any of the `patterns` specified.
 */
function fileMatchesAnyPattern(file: string, patterns: Array<string>): boolean {
  return patterns.some((pattern) => minimatch(file, pattern));
}

/**
 * For a set of files that changed, determine which builds should be triggered.
 */
export async function determineBuildsForEvent(
  owner_name: string,
  repo_name: string,
  event: BuildTriggerEvent
): Promise<Array<BuildConfig>> {
  const log = makeGitHubLog(LOG_PREFIX, owner_name, repo_name, event.sha);
  let builds_js = await readFileAtCommit(
    owner_name,
    repo_name,
    event.sha,
    'builds.js'
  );
  if (!builds_js) {
    log.info(`Could not read 'builds.js' file, aborting.`);
    return [];
  }

  let buildsByName = requireFromString(builds_js);
  let builds: Array<BuildConfig> = Object.keys(buildsByName).map((build_name) => {
    return {
      name: build_name,
      ...buildsByName[build_name],
    };
  });
  await Promise.all(builds.map(
    (build) => resolveBuildDependencies(owner_name, repo_name, event.sha, build)
  ));

  return builds.filter((build) => {
    // Step 1: Filter by events
    if (build.events && build.events.indexOf(event.type) === -1) {
      return false;
    }

    // Step 2: Filter by branches
    if (build.branches && build.branches.indexOf(event.branch) === -1) {
      return false;
    }

    // Step 3: Filter by files changed.
    if (build.files) {
      let filesForThisBuild = event.filesChanged.slice();

      // First remove any files that are in the ignore list.
      if (build.ignore_files) {
        filesForThisBuild = filesForThisBuild.filter(
          (file) => !fileMatchesAnyPattern(file, build.ignore_files || [])
        );
      }

      // Then remove any files that don't match the build's whitelist.
      filesForThisBuild = filesForThisBuild.filter(
        (file) => fileMatchesAnyPattern(file, build.files || [])
      );

      // If at this point we don't any files are left over, we don't
      // want to run this build.
      if (!filesForThisBuild.length) {
        return false;
      }
    }

    return true;
  });
}
