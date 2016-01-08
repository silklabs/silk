/**
 * @flow
 * @providesModule silk-core-version
 */

type Version = {
  branch: string;
  buildtime: string;
  official: bool;
  semver: string;
  sha: string;
};

declare export default Version;
