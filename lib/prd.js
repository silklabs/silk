/**
 * PRD manipulation tool
 */
const prdRepo = 'x-concept-prd';

const priorityLabels = {
  'P1:must-have': 1,
  'P2:must-have': 2,
  'P3:must-have': 3,
  'P4:high-want': 4,
  'P5:high-want': 5,
  'P6:high-want': 6,
  'P7:nice-to-have': 7,
  'P8:nice-to-have': 8,
  'P9:nice-to-have': 9,
};

const loeLabels = {
  'LoE:1 (XS)': 1,
  'LoE:2 (S)': 2,
  'LoE:5 (M)': 5,
  'LoE:8 (L)': 8,
  'LoE:13 (XL)': 13,
  'LoE:21 (XXL)': 21,
};

const workflowLabels = [
  '0 - Deferred',
  '1 - Draft',
  '2 - Review',
  '3 - Ready',
  '4 - In Progress',
  '5 - Validate',
  '6 - Ship',
];

const ownerLabelPrefix = 'Who:';

///////////////////////////////////////////////////////////

function issuePriority(issue) {
  let name = null;
  let value = 100000;

  issue.labels.find(label => {
    if (priorityLabels[label.name] !== undefined) {
      name = label.name;
      value = priorityLabels[name];
    }
  });
  return { name, value };
}

function issueLoE(issue) {
  let name = null;
  let value = 0;

  issue.labels.find(label => {
    if (loeLabels[label.name] !== undefined) {
      name = label.name;
      value = priorityLabels[name];
    }
  });
  return { name, value };
}

function issueOwners(issue) {
  let owners = [];
  issue.labels.forEach(label => {
    if (label.name.startsWith(ownerLabelPrefix)) {
      owners.push(label.name);
    }
  });

  return owners;
}

function issueState(issue) {
  let stateIndex = -1;
  issue.labels.forEach(label => {
    const index = workflowLabels.indexOf(label.name);
    if (index !== -1) {
      stateIndex = index;
    }
  });

  if (stateIndex !== -1) {
    return workflowLabels[stateIndex];
  }
  return null;
}

import makeLog from 'log';
const log = makeLog('prd');
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

function issuePrioritySort(a, b) {
  const pa = issuePriority(a).value;
  const pb = issuePriority(b).value;
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
                  `(${issuePriority(i).name})` +
                  `(${issueState(i)})` +
                  `(${issueLoE(i).name})` +
                  `(${issueOwners(i).join(' ')})`);

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
  const issues = await fetchAllPrdIssues();
  printPrdRequirements(issues);
}

async function cmdLint() {
  let lint = [];
  const issues = await fetchAllPrdIssues();

  const permitOne = (issue, labels, name) => {
    let count = 0;
    issue.labels.map(label => {
      if (loeLabels[label.name] !== undefined) {
        count++;
      }
    });
    if (count > 1) {
      lint.push([issue.number,
        `${count} ${name} labels present, maximum of 1 permitted`]);
    }
  };

  for (let issue of issues) {
    permitOne(issue, loeLabels, 'LoE');
    permitOne(issue, priorityLabels, 'priority');
    permitOne(issue, workflowLabels, 'workflow');

    const state = issueState(issue);
    if (state === null) {
      lint.push([issue.number, 'No workflow label']);
    } else {
      if (state.substring(0, 1) > 3 /* - Ready */) {
        if (issuePriority(issue).name === null) {
          lint.push([issue.number, `No priority assigned`]);
        }

        if (issueLoE(issue).name === null) {
          lint.push([issue.number, `No LoE assigned`]);
        }

        if (issueOwners(issue).length < 1) {
          lint.push([issue.number, `No owner(s) identified ("Who:..." label)`]);
        }
      }
    }
  }

  if (lint.length > 0) {
    for (let e of lint) {
      console.log(`#${e[0]} - ${e[1]}`);
    }
    console.log(`\n${lint.length} lints.`);
    //return 1; // non-zero exit status
  }
}

if (require.main === module) {
  const commands = {
    print: {
      f: cmdPrint,
      description: 'Prints PRD requirements',
    },
    lint: {
      f: cmdLint,
      description: 'Lints the PRD',
    },
  };

  let [node, program, cmd, ...args] = process.argv;
  if (commands[cmd]) {
    (async function() {
      let exitcode = 1;
      try {
        exitcode = await commands[cmd].f(...args);
      } catch (err) {
        log.error(err.stack);
      }
      process.exit(exitcode); //eslint-disable-line no-process-exit
    })();

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
