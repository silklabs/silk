/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

import React from 'react';
import { Button, ButtonGroup, Glyphicon,
         ListGroup, ListGroupItem, Modal } from 'react-bootstrap';
import Iframe from 'react-iframe';
import { Link } from 'react-router';
import Reports from '../libraries/CrashReports';

const styles = {
  crashReport: {
    backgroundColor: 'white',
    width: '800ps',
    height: '600px',
  }
};

class CrashReport extends React.Component {
  state = { crashUrl: '' };

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
    return (
      <div>
        <Link onClick={() => this.onShowCrash(crash.url)}>
          <ListGroupItem>{datetime.toString()}</ListGroupItem>
        </Link>

        <Modal show={!!this.state.crashUrl.length}
             onHide={this.onHideCrash}>
          <div style={styles.crashReport}>
            <Iframe url={this.state.crashUrl} />
          </div>
        </Modal>
      </div>
    );
  }
}

export default class CrashReports extends React.Component {
  state = {
    crashes: null,
    modal: true,
  };

  constructor(props) {
    super(props);
    Reports.findByDeviceId(this.props.params.deviceId)
      .then(crashes => this.setState({ crashes }))
      .catch(err => console.error('Failed to fetch crash reports:', err));
  }

  onToggleModal = () => {
    this.setState({ modal: !this.state.modal });
  }

  render() {
    let content;
    if (null === this.state.crashes) {
      content = (<div>Loading crash reports ...</div>);
    } else if (0 === this.state.crashes.length) {
      content = (<div>No crashes!!</div>);
    } else {
      content = this.state.crashes.map(crash => (
        <CrashReport crash={crash} modal={this.state.modal}/>
      ));
    }
    return (
      <div>
        <ButtonGroup>
          <Button bsStyle='warning'>
            <Link to='/'><Glyphicon glyph='home' /></Link>
          </Button>
          <Button bsStyle='info' onClick={this.onToggleModal}>
            Open in {this.state.modal ? 'Window' : 'Frame'}
          </Button>
        </ButtonGroup>
        <ListGroup>
          {content}
        </ListGroup>
      </div>
    );
  }
}
