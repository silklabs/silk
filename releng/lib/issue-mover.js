/**
 * Migrates all silk-* issues with the 'silk-core+' label into the silk-core
 * project.
 *
 * This script can be retired once we've fully moved into the silk-core project
 *
 * @flow
 */

import makeLog from 'log';
const log = makeLog('main');
import Octokat from 'octokat'; // Ref: https://www.npmjs.com/package/octokat

if (!process.env.GITHUB_TOKEN) {
  throw new Error('GITHUB_TOKEN environment variable undefined');
}

let octo = new Octokat({
  token: process.env.GITHUB_TOKEN,
});

async function main() {
  let issues = await octo.search.issues.fetch({
    'q': 'is:open is:issue user:silklabs label:silk-core+',
  });
  log.info(`Found ${issues.totalCount} issues`);
  await Promise.all(issues.items.map(async (issue) => {

    let issueContents = {
      title: issue.title,
      labels: issue.labels.map(label => label.name).filter(name => name !== 'silk-core+'),
      milestone: 2, /* silk-core "Backlog" milestone */
      body: '##### Issue migrated from ' + issue.htmlUrl + '\n----\n' + issue.body,
    };
    const sourceRepo = issue.htmlUrl.match(/silk-([^/]*)/);
    if (sourceRepo) {
      issueContents.labels.splice(0, 0, sourceRepo[1]);
    } else if (issue.htmlUrl.match(/releng/)) {
      issueContents.labels.splice(0, 0, 'releng');
    }

    let newissue = await octo.repos('silklabs', 'silk-core').issues.create(issueContents);
    log.info(`Created Issue #${newissue.number}`);
    await issue.update({state: 'closed'});
  }));
}

main()
.catch(err => log.error(err.stack));
