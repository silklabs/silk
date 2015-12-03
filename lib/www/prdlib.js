/**
 * PRD manipulation module
 */
import makeLog from 'log';
const log = makeLog('prd');

export const prdRepo = 'x-concept-prd';

export const priorityLabels = {
  'P1:must-have': 0,
  'P2:must-have': 1,
  'P3:must-have': 2,
  'P4:high-want': 3,
  'P5:high-want': 4,
  'P6:high-want': 5,
  'P7:nice-to-have': 6,
  'P8:nice-to-have': 7,
  'P9:nice-to-have': 8,
};

export const loeLabels = {
  'LoE:1 (XS)': 1,
  'LoE:2 (S)': 2,
  'LoE:5 (M)': 5,
  'LoE:8 (L)': 8,
  'LoE:13 (XL)': 13,
  'LoE:21 (XXL)': 21,
};

export const workflowLabels = [
  '0 - Deferred',
  '1 - Draft',
  '2 - Review',
  '3 - Ready',
  '4 - In Progress',
  '5 - Validate',
  '6 - Ship',
];

const ownerLabelPrefix = 'Who:';

export function issuePriority(issue) {
  let name = null;
  let value = priorityLabels['P9:nice-to-have'];

  issue.labels.find(label => {
    if (priorityLabels[label.name] !== undefined) {
      name = label.name;
      value = priorityLabels[name];
    }
  });
  return { name, value };
}

export function issueLoE(issue) {
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

export function issueOwners(issue) {
  let owners = [];
  issue.labels.forEach(label => {
    if (label.name.startsWith(ownerLabelPrefix)) {
      owners.push(label.name);
    }
  });

  return owners;
}

export function issueState(issue) {
  let stateIndex = -1;
  issue.labels.forEach(label => {
    const index = workflowLabels.indexOf(label.name);
    if (index !== -1) {
      stateIndex = index;
    }
  });

  if (stateIndex !== -1) {
    return { name: workflowLabels[stateIndex], value: stateIndex };
  }
  return { name: null, value: 1 /* - Draft */};
}


function _issuePrioritySort(a, b) {
  const pa = issuePriority(a).value;
  const pb = issuePriority(b).value;
  if (pa < pb) {
    return -1;
  } else if (pa > pb) {
    return 1;
  }
  return 0;
}

export async function fetchAllPrdItems(octo) {
  let repo = octo.repos('silklabs', prdRepo);

  let allIssues = [];
  let issues = await repo.issues.fetch();
  allIssues = issues;
  while (issues.nextPage) {
    log.info('nextPage', issues.length, allIssues.length);
    issues = await issues.nextPage();
    allIssues = allIssues.concat(issues);
  }

  // Collect issues by milestones
  let milestones = {};
  allIssues.forEach(i => {
    if (milestones[i.milestone.title] === undefined) {
      milestones[i.milestone.title] = [];
    }
    milestones[i.milestone.title].push(i);
  });

  for (const m in milestones) {
    milestones[m] = milestones[m].sort(_issuePrioritySort);
  }

  return milestones;
}


export function lintPrdItem(issue) {
  let lint = [];

  const permitOne = (issue, labels, name) => {
    let count = 0;
    issue.labels.map(label => {
      if (loeLabels[label.name] !== undefined) {
        count++;
      }
    });
    if (count > 1) {
      lint.push([issue.number, `${count} ${name} labels present, maximum of 1 permitted`]);
    }
  };

  permitOne(issue, loeLabels, 'LoE');
  permitOne(issue, priorityLabels, 'priority');
  permitOne(issue, workflowLabels, 'workflow');

  const state = issueState(issue);
  if (state.name === null) {
    lint.push([issue.number, 'No workflow label']);
  } else {
    if (state.value >= 3 /* - Ready */) {
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
  if (lint.length > 0) {
    return lint;
  }
}
