/**
 * PRD manipulation module
 *
 * @flow
 */
import makeLog from 'log';
const log = makeLog('prd');

type GithubIssueLabel = {
  name: string;
};

type GithubIssue = {
  number: number;
  labels: Array<GithubIssueLabel>;
};

export const prdRepo = 'silk-vision-prd';
export const prdRepoName = 'Silk Vision Product Requirements';

export const priorityLabels = {
  'must-have': 0,
  'high-want': 1,
  'nice-to-have': 2,
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
const silkOwnerLabelPrefix = 'Who:Silk';

type IssuePriorityResponse = {
  name: ?string;
  value: number;
};
export function issuePriority(issue: GithubIssue): IssuePriorityResponse {
  let name = null;
  let value = priorityLabels['nice-to-have'];

  issue.labels.find(label => {
    if (priorityLabels[label.name] !== undefined) {
      name = label.name;
      value = priorityLabels[name];
    }
  });
  return { name, value };
}

type IssueLoEResponse = {
  name: ?string;
  value: number;
};
export function issueLoE(issue: GithubIssue): IssueLoEResponse {
  let name = null;
  let value = 0;

  issue.labels.find(label => {
    if (loeLabels[label.name] !== undefined) {
      name = label.name;
      value = loeLabels[name];
    }
  });
  return { name, value };
}

export function issueOwners(issue: GithubIssue): Array<string> {
  let owners = [];
  issue.labels.forEach(label => {
    if (label.name.startsWith(ownerLabelPrefix)) {
      owners.push(label.name);
    }
  });

  return owners;
}

type IssueStateResponse = {
  name: ?string;
  value: number;
};
export function issueState(issue: GithubIssue): IssueStateResponse {
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

type AllPrdItems = {
  itemsByMilestone: { [key: string]: Array<GithubIssue>; };
  milestoneDescriptions: { [key: string]: string; };
};

export async function fetchAllPrdItems(octo: any): Promise<AllPrdItems> {
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
  let milestoneDescriptions = {};
  allIssues.forEach(i => {
    const title = i.milestone ? i.milestone.title : '';
    if (milestones[title] === undefined) {
      milestones[title] = [];
      if (i.milestone) {
        milestoneDescriptions[title] = i.milestone.description;
      }
    }
    milestones[title].push(i);
  });

  for (const m in milestones) {
    milestones[m] = milestones[m].sort(_issuePrioritySort);
  }

  return { itemsByMilestone: milestones, milestoneDescriptions };
}

export function lintPrdItem(issue: GithubIssue) : ?Array<[number, string]> {
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
    return lint;
  }

  if (state.value >= 3 /* - Ready */) {
    if (issuePriority(issue).name === null) {
      lint.push([issue.number, `No priority assigned`]);
    }

    const owners = issueOwners(issue);

    if (issueLoE(issue).name === null) {
      let loeLint = true;
      if (owners.length > 0) {
        // Only issues with Silk owners are expected to have LoEs
        loeLint = owners.some(
          (owner) => owner.startsWith(silkOwnerLabelPrefix));
      }
      if (loeLint) {
        lint.push([issue.number, `No LoE assigned`]);
      }
    }

    if (owners.length < 1) {
      lint.push([issue.number, `No owner(s) identified ("Who:..." label)`]);
    }
  }
  if ( (state.value === 4 /* - In Progress */) ||
       (state.value === 5 /* - Validate */) ) {
    if (issue.assignee === null) {
      lint.push([issue.number, `Not assigned to one human`]);
    }
  }

  if (!lint.length) {
    return null;
  }
  return lint;
}
