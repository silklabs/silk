import React from 'react';
import {
  Alert,
  Button,
  ButtonToolbar,
  ButtonGroup,
  DropdownButton,
  Label,
  ListGroup,
  ListGroupItem,
  MenuItem,
  Panel,
  ProgressBar,
  Well,
} from 'react-bootstrap';
import createLog from 'log';
const log = createLog('prd');

import * as prd from '../prdlib';

const PrdLintOptions = [ 'Show', 'Hide', 'Only' ];


class PrdItem extends React.Component {
  state = {};

  render() {
    const issue = this.props.item;

    const priority = prd.issuePriority(issue);
    const issueState = prd.issueState(issue);

    if (this.props.params.filterBy.state[issueState.name ? issueState.name : '1 - Draft'] === false) {
      return <div/>; // Item has been filtered out by state
    }

    if (this.props.params.filterBy.priority[priority.name ? priority.name : 'nice-to-have'] === false) {
      return <div/>; // Item has been filtered out by priority
    }

    let labels;
    if (this.props.params.labels) {
      labels = (
        <p style={{float: 'right'}}>
          <Label bsStyle="primary">{priority.name}</Label>
          &nbsp;
          <Label bsStyle="success">{issueState.name}</Label>
          &nbsp;
          <Label bsStyle="danger">{prd.issueLoE(issue).name}</Label>
          &nbsp;
          {prd.issueOwners(issue).map(who => <Label key={issue.number + who} bsStyle="default">{who}</Label>)}
        </p>
      );
    }

    const lint = prd.lintPrdItem(issue);
    let lintLabels = <div/>;
    switch (this.props.params.lint) {
    case 'Only':
      if (!lint) {
        return <div/>; // Item has no lint, don't show it.
      }
      // falls through
    case 'Show':
      if (lint) {
        lintLabels = lint.map(lintInfo =>
            <div key={issue.number + lintInfo[1]}>
              <Label bsStyle="danger">
                Lint: {lintInfo[1]}
              </Label>
            </div>
          );
      }
      break;
    case 'Hide':
      break;
    default:
      throw new Error('Unknown lint option');
    }

    // Search for enumerated lists in the issue body
    let bulletList;
    { //eslint-disable-line no-lone-blocks
      let bullets = [];
      const re = new RegExp('- \\[.\\](.*)\r\n', 'g'); //eslint-disable-line no-control-regex
      let reResult = re.exec(issue.body);
      while (reResult !== null) {
        bullets.push(reResult[1].trim());
        reResult = re.exec(issue.body);
      }
      if (bullets.length > 0) {
        bulletList = (
          <ul>
            {bullets.map(i => <li key={i}>{i}</li>)}
          </ul>
        );
      }
    }

    let bsStyle = '';
    if (this.props.params.labels) {
      if (priority.value <= prd.priorityLabels['must-have']) {
        bsStyle = 'warning';
      } else if (priority.value >= prd.priorityLabels['nice-to-have']) {
        bsStyle = 'success';
      }
    }

    const issueUrl = `https://github.com/silklabs/${prd.prdRepo}/issues/${issue.number}`;
    return (
      <ListGroupItem bsStyle={bsStyle} target="_blank" href={issueUrl}>
        {labels}
        #{issue.number} - {issue.title}
        {bulletList}
        {lintLabels}
      </ListGroupItem>
    );
  }
}

class PrdSection extends React.Component {
  state = {};

  render() {
    let progress;
    if (this.props.params.progress) {
      try {
        let numberByWorkflowLabel = Array(prd.workflowLabels.length).fill(0);

        this.props.items.forEach(item => {
          const state = prd.issueState(item);
          numberByWorkflowLabel[state.value]++;
        });

        progress = <ProgressBar max={this.props.items.length} >
          <ProgressBar bsStyle="danger" label="Draft %(percent)s%" max={this.props.items.length} now={numberByWorkflowLabel[1]} />
          <ProgressBar bsStyle="warning" label="Review %(percent)s%" max={this.props.items.length} now={numberByWorkflowLabel[2]} />
          <ProgressBar bsStyle="info" label="Ready %(percent)s%" max={this.props.items.length} now={numberByWorkflowLabel[3]} />
          <ProgressBar bsStyle="success" label="In Progress %(percent)s%" max={this.props.items.length} now={numberByWorkflowLabel[4]} />
          <ProgressBar label="Validate %(percent)s%" max={this.props.items.length} now={numberByWorkflowLabel[5]} />
          <ProgressBar label="Ship %(percent)s%" max={this.props.items.length} now={numberByWorkflowLabel[6]} />
        </ProgressBar>;
      } catch (e) {
        log.info(e.stack);
      }
    }
    const milestoneUrl = `https://github.com/silklabs/${prd.prdRepo}/issues?q=` +
      `is:open+is:issue+milestone:${encodeURIComponent('"' + this.props.section + '"')}`;

    let panelHeader = (
        <div>
          <a target="_blank" href={milestoneUrl}>{this.props.section}</a>
          {progress}
        </div>
      );

    return <Panel bsStyle="info" header={panelHeader}>
        <ListGroup fill>
          {
            this.props.items.map(item => {
              return <PrdItem key={item.number} params={this.props.params} item={item} />;
            })
          }
        </ListGroup>
      </Panel>;
  }
}

export default class Prd extends React.Component {
  static propTypes = {
    route: React.PropTypes.shape({
      userState: React.PropTypes.object.isRequired,
    }),
  };

  state = {
    labels: true,
    progress: false,
    lint: PrdLintOptions[0],
    filterBy: {
      priority: {},
      state: {},
    },
  };

  toggleState(what) {
    return () => {
      let deltaState = {};
      deltaState[what] = !this.state[what];
      this.setState(deltaState);
    };
  }

  toggleFilter(type, index) {
    return () => {
      let filterBy = this.state.filterBy;
      filterBy[type][index] = filterBy[type][index] === undefined ? false : !filterBy[type][index];
      this.setState(filterBy);
    };
  }

  selectLint = (evt, index) => {
    this.setState({lint: PrdLintOptions[index]});
  };

  async fetchPrd() {
    if (this.state.loadingMessage) {
      return;
    }

    try {
      this.setState({itemsByMilestone: null, loadingMessage: 'Loading...'});
      const itemsByMilestone = await prd.fetchAllPrdItems(this.props.route.userState.octo);
      this.setState({itemsByMilestone, loadingMessage: null});
    } catch (err) {
      this.setState({loadingMessage: 'Loading failed: ' + err.stack});
    }
  }

  componentWillMount() {
    this.fetchPrd();
  }

  render() {
    let zen;
    if (this.state.zen !== false) {
      zen = (
        <Alert
          bsStyle="success"
          dismissAfter={5000}
          onDismiss={() => this.setState({zen: false})}>
          <strong>Remember:</strong> {this.props.route.userState.zen}
        </Alert>
      );
    }

    let lintOptions =
      <DropdownButton
        id="lintDropdown"
        bsSize="small"
        title={`Lint:${this.state.lint}`}
        onSelect={this.selectLint}>
          {PrdLintOptions.map((value, index) => {
            return (
              <MenuItem
                key={index}
                eventKey={index}
                active={this.state.lint === PrdLintOptions[index]} > {value}
              </MenuItem>
            );
          })}
      </DropdownButton>;
    const navBar = (
      <Well bsSize="small">
        <ButtonToolbar>
          <Button bsSize="small" active={this.state.labels}
            onClick={this.toggleState('labels')}>Labels
          </Button>
          <Button
            bsSize="small"
            active={this.state.progress}
            onClick={this.toggleState('progress')}>Progress
          </Button>
          {lintOptions}
          <Button bsSize="small" onClick={() => this.fetchPrd()}>
            Reload
          </Button>
        </ButtonToolbar>
        <p/>
        <div>
          Priority:<ButtonGroup bsSize="xsmall">
            {Object.keys(prd.priorityLabels).map((value) =>
              <Button
                active={this.state.filterBy.priority[value] !== false}
                onClick={this.toggleFilter('priority', value)}>
                {value}
              </Button>
            )}
          </ButtonGroup>
          &nbsp;
          State:<ButtonGroup bsSize="xsmall">
            {prd.workflowLabels.map((value) =>
              <Button
                active={this.state.filterBy.state[value] !== false}
                onClick={this.toggleFilter('state', value)}>
                {value.substr(3)}
              </Button>
             )}
          </ButtonGroup>
        </div>
      </Well>
    );

    let prdBody;
    if (!this.state.itemsByMilestone) {
      prdBody = <Alert bsStyle="warning">{this.state.loadingMessage}</Alert>;
    } else {
      prdBody = Object.keys(this.state.itemsByMilestone).sort().map(
          section => {
            return (
                <PrdSection
                  key={section}
                  params={this.state}
                  section={section}
                  filterBy={this.state.filterBy}
                  items={this.state.itemsByMilestone[section]}
                />
              );
          }
        );
    }

    let prdRepoLink;
    if (this.state.labels) {
      prdRepoLink =
        <sup><a
          target="_blank"
          href={'https://github.com/silklabs/' + prd.prdRepo}>
          *
        </a></sup>;
    }
    return (
      <div>
        {zen}
        {navBar}
        <h3>{prd.prdRepoName}{prdRepoLink}</h3>
        <hr/>
        {prdBody}
      </div>
    );
  }
}
