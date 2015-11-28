/**
 * PRD manipulation tool
 */
const prdRepo = 'x-concept-prd';

import makeLog from 'log';
const log = makeLog('main');
import Octokat from 'octokat'; // Ref: https://www.npmjs.com/package/octokat

import { LocalStorage } from 'node-localstorage';
import path from 'path';

class JSONStorage extends LocalStorage {
  constructor() {
    super(path.join(__dirname, 'prdCache'));
  }

  getItem(key) {
    return JSON.parse(super.getItem(key));
  }

  setItem(key, value) {
    super.setItem(key, JSON.stringify(value));
  }
}


if (!process.env.GITHUB_TOKEN) {
  throw new Error('GITHUB_TOKEN environment variable undefined');
}

let octo = new Octokat({
  token: process.env.GITHUB_TOKEN,
});


async function fetchAllIssues(repo) {
  let allIssues = [];
  let issues = await repo.issues.fetch();
  allIssues = issues;
  log.info(issues[0].title);
  while (issues.nextPage) {
    log.info('..next', issues.length, allIssues.length);
    issues = await issues.nextPage();
    allIssues = allIssues.concat(issues);
  }
  return allIssues;
}


async function fetchAllPrdIssues() {
  let repo = octo.repos('silklabs', prdRepo);
  let storage = new JSONStorage();
  let issues = storage.getItem('fetchAllIssues');
  if (!issues) {
    issues = await fetchAllIssues(repo);
    storage.setItem('fetchAllIssues', issues);
  }
  return issues;
}


function issuePriority(issue, opts) {
  opts = opts || {};

  const priorities = { 'must-have': 1, 'high-want': 2, 'nice-to-have': 3, 'TBD': 4 };
  let priority = 'TBD';

  issue.labels.find(label => {
    if (priorities[label.name] !== undefined) {
      priority = label.name;
    }
  });
  return opts.text ? priority : priorities[priority];
}


function issuePrioritySort(a, b) {
  const pa = issuePriority(a);
  const pb = issuePriority(b);
  if (pa < pb) {
    return -1;
  } else if (pa > pb) {
    return 1;
  }
  return 0;
}


function printPrdRequirements(allIssues) {

  // Collect issues by milestones
  let milestones = {};
  allIssues.forEach(i => {
    if (milestones[i.milestone.title] === undefined) {
      milestones[i.milestone.title] = [];
    }
    milestones[i.milestone.title].push(i);
  });

  Object.keys(milestones).sort().map(milestone => {
    console.log(milestone);
    milestones[milestone].sort(issuePrioritySort).forEach(i => {
      console.log(`  #${i.number} - ${i.title} ` +
                  `(${issuePriority(i, {text: true})})`);

      // Search for enumerated lists in the issue body
      let re = new RegExp('- \\[ \\](.*)\r\n', 'g'); //eslint-disable-line no-control-regex
      let reResult = re.exec(i.body);
      while (reResult !== null) {
        console.log('      *', reResult[1].trim());
        reResult = re.exec(i.body);
      }
    });
  });
}

async function cmdPrint() {
  try {
    let issues = await fetchAllPrdIssues();
    printPrdRequirements(issues);

  } catch (err) {
    log.error(err.stack);
  }
}


const commands = {
  print: {
    f: cmdPrint,
    description: 'Prints PRD requirements',
  },
  lint: {
    f: () => undefined,
    description: 'Lints the PRD',
  },
};

if (require.main === module) {
  let [node, program, cmd, ...args] = process.argv;
  if (commands[cmd]) {
    commands[cmd].f(...args);
  } else {
    if (cmd !== undefined) {
      console.log(`Unknown command: ${cmd}`);
    }
    console.log(`Usage: ${node} ${program} <command>`);
    console.log(`\nAvailable commands:`);
    Object.keys(commands).forEach(c => {
      console.log(`  ${c} - ${commands[c].description}`);
    });

  }
}
