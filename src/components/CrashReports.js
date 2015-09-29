/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

import React from 'react';
import { Button, ButtonToolbar, DropdownButton, Glyphicon, Label,
         ListGroup, ListGroupItem, MenuItem, Modal } from 'react-bootstrap';
import Iframe from 'react-iframe';
import { Link } from 'react-router';
import Reports from '../libraries/CrashReports';

const SHOW_INITIAL_NUMBER_REPORTS = 100;
const LOAD_MORE_PAGES_THRESHOLD = 2;
const LOAD_MORE_PAGES_INCREMENT = 2;
const SCROLL_DEBOUNCE_MS = 200;

const styles = {
  newReport: {
    display: 'flex',
    flexDirection: 'row',
  },
  oldReport: {
    display: 'flex',
    flexDirection: 'row',
    backgroundColor: 'gray'
  },
  checkbox: {
    margin: '6px',
  },
  link: {
    flex: 1,
  },

  labelButton: {
    backgroundColor: 'gray',
    color: 'white'
  },
  crashReport: {
    backgroundColor: 'white',
    width: '800ps',
    height: '600px',
  }
};

class Checkbox extends React.Component {
  state = { checked: false };

  constructor(props) {
    super(props);
    this.state.checked = this.props.checked;
  }

  check(value) {
    this.setState({ checked: value });
  }

  onChange = e => {
    this.setState({ checked: e.target.checked });
    if (this.props.onChange) {
      this.props.onChange(e);
    }
  };

  render() {
    return (
      <input type='checkbox' checked={this.state.checked}
             onChange={this.onChange} style={this.props.style} />
    );
  }
}

class CrashReport extends React.Component {
  static propTypes = {
    crash: React.PropTypes.object.isRequired,
    shouldOpenInModal: React.PropTypes.bool.isRequired,
  };

  state = {
    modalUrl: null,
    isMarkedOld: this.props.crash.old,
  };

  isSelected() {
    return this.refs.checkbox.state.checked;
  }
  select(value) {
    this.refs.checkbox.check(value);
  }

  onShowCrash = url => {
    if (this.props.shouldOpenInModal) {
      this.setState({ modalUrl: url });
    } else {
      window.open(url);
    }
    return false;
  };

  onHideModal = () => {
    this.setState({ modalUrl: null });
  };

  // Hooks to ensure that we don't re-render every single CrashReport
  // item when the entire list gets re-rendered (which happens any
  // time a report gets marked as old, for instance). Because crash
  // objects are mutated, we can't simply compare old props to new
  // props, so we need to copy the flag that changes to our internal
  // state first.
  componentWillReceiveProps(nextProps) {
    this.setState({isMarkedOld: nextProps.crash.old});
  }
  shouldComponentUpdate(nextProps, nextState) {
    return this.state.modalUrl !== nextState.modalUrl ||
      this.state.isMarkedOld !== nextState.isMarkedOld;
  }

  render() {
    let crash = this.props.crash;
    let datetime = new Date(Date.parse(crash.timeStamp));
    let bgStyle = crash.old ? styles.oldReport : styles.newReport;
    return (
      <ListGroupItem style={bgStyle}>
        <Checkbox ref='checkbox' style={styles.checkbox} />
        <Link style={styles.link} onClick={() => this.onShowCrash(crash.url)}>
          {datetime.toString()}
        </Link>

        <Modal show={!!this.state.modalUrl}
             onHide={this.onHideModal}>
          <div style={styles.crashReport}>
            <Iframe url={this.state.modalUrl} />
          </div>
        </Modal>
      </ListGroupItem>
    );
  }
}

export default class CrashReports extends React.Component {
  state = {
    crashes: null,
    error: '',
    shouldOpenInModal: true,
    numberOfReportsToShow: SHOW_INITIAL_NUMBER_REPORTS,
  };

  constructor(props) {
    super(props);
    this.refreshCrashReports();
  }

  componentDidMount() {
    window.addEventListener('scroll', this.handleScroll);
  }

  componentWillUnmount() {
    window.removeEventListener('scroll', this.handleScroll);
  }

  handleScroll = () => {
    if (this._debouncedScroll) {
      return;
    }

    // This is somewhat approximate because it doesn't take the menu at
    // the top into account, but good enough for what we're doing here.
    let el = document.documentElement;
    let totalPages = el.scrollHeight / el.clientHeight;
    let currentPage = window.scrollY / el.clientHeight;
    if (totalPages - currentPage > LOAD_MORE_PAGES_THRESHOLD) {
      // We're still not within the threshold (expressed in number of pages).
      return;
    }
    // Figure out how many more reports to load. This is expressed in pages,
    // so it isn't a static number of reports, but rather depends on how big
    // the browser window is.
    let reportsPerPage = this.state.numberOfReportsToShow / totalPages;
    let additionalReports = Math.ceil(reportsPerPage * LOAD_MORE_PAGES_INCREMENT);
    let numberOfReportsToShow = this.state.numberOfReportsToShow + additionalReports;
    this.setState({numberOfReportsToShow});

    // Finally, don't do any of this on every scroll event. Because (a) it's
    // not necessary to do it that often and (b) React + DOM + browser reflow
    // is unlikely to keep up, so we'd be incrementing range several times
    // over before it would take any effect.
    this._debouncedScroll = window.setTimeout(
      () => delete this._debouncedScroll,
      SCROLL_DEBOUNCE_MS
    );
  };

  refreshCrashReports() {
    Reports.findByDeviceId(this.props.params.deviceId)
      .then(crashes => this.setState({ crashes }))
      .catch(err => this.setState({ error: err.toString() }));
  }

  onToggleModal = () => {
    this.setState({ shouldOpenInModal: !this.state.shouldOpenInModal });
  };

  onSelect = (e, what) => {
    let value = (what === 'all');
    this.state.crashes.forEach(crash => {
      this.refs[crash.id].select(value);
    });
  };

  onMarkAs = (e, what) => {
    Reports.setCrashesState(
      this.props.params.deviceId,
      this.state.crashes.filter(crash => this.refs[crash.id].isSelected()),
      what === 'old'
    );
    this.onSelect(null, 'none');
    this.refreshCrashReports();
  };

  render() {
    let error = null;
    if (this.state.error) {
      error = (
        <h2>
          <Label bsStyle='danger'>
            Failed to fetch crash reports: {this.state.error}
          </Label>
        </h2>
      );
    }
    let content;
    if (null === this.state.crashes) {
      content = (<div>Loading crash reports ...</div>);
    } else if (0 === this.state.crashes.length) {
      content = (<div>No crashes!!</div>);
    } else {
      content = this.state.crashes
        .slice(0, this.state.numberOfReportsToShow)
        .map(crash => (
          <CrashReport key={crash.id} ref={crash.id} crash={crash}
                       shouldOpenInModal={this.state.shouldOpenInModal}/>
        ));
    }
    return (
      <div>
        <ButtonToolbar>
          <Button bsStyle='warning'>
            <Link to='/'><Glyphicon glyph='home' /></Link>
          </Button>

          <DropdownButton title='Select' onSelect={this.onSelect}>
            <MenuItem eventKey='all'>All</MenuItem>
            <MenuItem eventKey='none'>None</MenuItem>
          </DropdownButton>

          <DropdownButton title='Mark as' onSelect={this.onMarkAs}>
            <MenuItem eventKey='old'>Old</MenuItem>
            <MenuItem eventKey='new'>New</MenuItem>
          </DropdownButton>

          <Button bsStyle='info' onClick={this.onToggleModal}>
            Open in {this.state.shouldOpenInModal ? 'Window' : 'Frame'}
          </Button>
        </ButtonToolbar>
        {error}
        <div>
          {content}
        </div>
      </div>
    );
  }
}
