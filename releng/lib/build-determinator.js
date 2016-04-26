/**
 * Machinery to determine which builds to trigger given a set of parameters
 *
 * @flow
 */

import path from 'path';
import minimatch from 'minimatch';
import requireFromString from 'require-from-string';

import {
  readFileAtCommit,
  makeGitHubLog,
} from './github';

import type { TravisBuildConfig } from './travis';

export type EventType = 'push' | 'pr' | 'nightly' | string;
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
  name?: string;
  type?: EventType;
  sha: string;
  branch: string;
  filesChanged?: Array<string>;
};

const LOG_PREFIX = 'build-determinator';

export const BUILDS_DEFINITION_FILE = 'builds.js';

/**
 * Determine any additional files that, when changed, should trigger a
 * given build.
 *
 */
async function resolveAdditionalFileDependencies(
  owner_name: string,
  repo_name: string,
  sha: string,
  build: BuildConfig
): Promise<void> {
  const log = makeGitHubLog(LOG_PREFIX, owner_name, repo_name, sha);

  // If a build does not declare any file dependencies, then it wants
  // to not filter based on files changed. IOW, it wants to get run on
  // every event that matches its other filters (e.g. it's a nightly
  // build.) In this case, we won't add any additional file dependencies
  // as that would restrict when the build gets run greatly.
  if (!build.files) {
    log.info(`Build '${build.name}' does not specify any file dependencies. ` +
             `Not adding any.`);
    return;
  }

  // Changing the build's own Travis configuration will trigger it.
  let buildFiles = build.files;
  buildFiles.push(build.travis_yml);

  if (!build.package_json) {
    log.info(`Build '${build.name}' does not specify a package.json file. ` +
             `Not adding npm dependencies.`);
    return;
  }

  // An npm project's package.json is an implicit file dependency. Any
  // local symlinkDependencies that are listed within are added to this
  // build's files as well.
  // TODO: we don't do this recursively yet
  let package_json = build.package_json;
  let packageJSON = await readFileAtCommit(
    owner_name,
    repo_name,
    sha,
    build.package_json
  );
  if (!packageJSON) {
    log.info(`Could not read ${package_json} for build '${build.name}'.`);
    return;
  }
  buildFiles.push(package_json);

  let packageConfig = JSON.parse(packageJSON);
  let localDeps = packageConfig.symlinkDependencies;
  if (!localDeps) {
    log.info(`${package_json} does not define any symlinkDependencies.`);
    return;
  }

  for (let packageName in localDeps) {
    let depPath = localDeps[packageName];
    let absPath;
    if (depPath[0] === '/') {
      absPath = depPath.slice(1);
    } else {
      absPath = path.resolve(package_json, depPath);
    }
    buildFiles.push(path.join(absPath, '**'));
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
    BUILDS_DEFINITION_FILE
  );
  if (!builds_js) {
    log.info(`Could not read '${BUILDS_DEFINITION_FILE}' file, aborting.`);
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
    (build) => resolveAdditionalFileDependencies(owner_name, repo_name, event.sha, build)
  ));

  return builds.filter((build) => {
    // Step 1: Filter by name
    if (event.name && !minimatch(build.name, event.name)) {
      return false;
    }

    // Step 2: Filter by events
    if (build.events && event.type && build.events.indexOf(event.type) === -1) {
      return false;
    }

    // Step 3: Filter by branches
    if (build.branches && build.branches.indexOf(event.branch) === -1) {
      return false;
    }

    // Step 4: Filter by files changed
    if (build.files && event.filesChanged) {
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
