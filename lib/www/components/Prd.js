import React from 'react';
import {
  Alert,
  Button,
  ButtonToolbar,
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

    let labels;
    if (this.props.params.labels) {
      labels = (
        <p style={{float: 'right'}}>
          <Label bsStyle="primary">{prd.issuePriority(issue).name}</Label>
          &nbsp;
          <Label bsStyle="success">{prd.issueState(issue)}</Label>
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
      const re = new RegExp('- \\[ \\](.*)\r\n', 'g'); //eslint-disable-line no-control-regex
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

    const issueUrl = `https://github.com/silklabs/${prd.prdRepo}/issues/${issue.number}`;
    return (
      <ListGroupItem target="_blank" href={issueUrl}>
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
          if (!state) {
            numberByWorkflowLabel[1 /* - Draft */]++;
          } else {
            numberByWorkflowLabel[state.substring(0, 1)]++;
          }
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
  };

  toggleState(what) {
    return () => {
      let deltaState = {};
      deltaState[what] = !this.state[what];
      this.setState(deltaState);
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
      this.setState({loadingMessage: err.stack});
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
      <DropdownButton id="lintDropdown"
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
      <Well bsSize="small"><ButtonToolbar>
        <Button active={this.state.labels}
          onClick={this.toggleState('labels')}>Labels
        </Button>
        <Button
          active={this.state.progress}
          onClick={this.toggleState('progress')}>Progress
        </Button>
        {lintOptions}
        <Button onClick={() => this.fetchPrd()}>
          Reload
        </Button>
      </ButtonToolbar></Well>
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
                  items={this.state.itemsByMilestone[section]}
                />
              );
          }
        );
    }

    return (
      <div>
        {zen}
        {navBar}
        <h3>"X Concept" Product Requirements</h3>
        <hr/>
        {prdBody}
      </div>
    );
  }
}
