/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

import React from 'react';
import { Button, ButtonToolbar, DropdownButton, Glyphicon, Label,
         ListGroup, ListGroupItem, MenuItem, Modal } from 'react-bootstrap';
import Iframe from 'react-iframe';
import { Link } from 'react-router';
import Reports from '../libraries/CrashReports';

const styles = {
  newReport: {
    display: 'flex',
    flexDirection: 'row',
  },
  oldReport: {
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
  state = { checked: false }

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
  state = { crashUrl: '' };

  isSelected() {
    return this.refs.checkbox.state.checked;
  }
  select(value) {
    this.refs.checkbox.check(value);
  }

  onShowCrash = url => {
    if (this.props.modal) {
      this.setState({ crashUrl: url });
    } else {
      window.open(url);
    }
    return false;
  };

  onHideCrash = () => {
    this.setState({ crashUrl: '' });
  };

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

        <Modal show={!!this.state.crashUrl.length}
             onHide={this.onHideCrash}>
          <div style={styles.crashReport}>
            <Iframe url={this.state.crashUrl} />
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
    modal: true,
  };

  constructor(props) {
    super(props);
    this.refreshCrashReports();
  }

  refreshCrashReports() {
    Reports.findByDeviceId(this.props.params.deviceId)
      .then(crashes => this.setState({ crashes }))
      .catch(err => this.setState({ error: err.toString() }));
  }

  onToggleModal = () => {
    this.setState({ modal: !this.state.modal });
  };

  onSelect = (e, what) => {
    let value = (what === 'all');
    this.state.crashes.forEach(crash => {
      this.refs[crash.id].select(value);
    });
  };

  onMarkAs = (e, what) => {
    Reports.setCrashesState(
      what === 'old',
      this.state.crashes.filter(crash => this.refs[crash.id].isSelected())
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
      content = this.state.crashes.map(crash => (
        <CrashReport key={crash.id} ref={crash.id} crash={crash}
                     modal={this.state.modal}/>
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
            Open in {this.state.modal ? 'Window' : 'Frame'}
          </Button>
        </ButtonToolbar>
        {error}
        <ListGroup>
          {content}
        </ListGroup>
      </div>
    );
  }
}
