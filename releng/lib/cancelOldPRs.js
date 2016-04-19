/**
 * Cancels older Travis jobs for pull requests across all Silk projects
 *
 * @flow
 */

import createLog from 'silk-log';
import { cancelOldPRBuilds } from './github-travis-integration';
import silkRepos from './repos';

const log = createLog('cancelOldPRs');

export async function cancelAllOldPRBuilds(): Promise<void> {
  for (const repo of silkRepos) {
    await cancelOldPRBuilds('silklabs', repo);
  }
}

if ((require: any).main === module) {
  (async function main() {
    try {
      await cancelAllOldPRBuilds();
      log.info('Success');
    } catch (err) {
      log.error(err.stack);
    }
  })();
}
