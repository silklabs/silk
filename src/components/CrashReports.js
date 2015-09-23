/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

import React from 'react';
import { Button, ButtonGroup, Glyphicon,
         ListGroup, ListGroupItem, Modal } from 'react-bootstrap';
import Iframe from 'react-iframe';
import { Link } from 'react-router';

import Api from '../libraries/Api';

const styles = {
  crashReport: {
    backgroundColor: 'white',
    width: '800ps',
    height: '600px',
  }
};

export default class CrashReports extends React.Component {
  state = {
    crashes: null,
    crashUrl: '',
    useIframe: true,
  };

  constructor(props) {
    super(props);
    let id = this.props.params.deviceId;
    Api.crashMeta.find({ deviceId: id })
      .then(crashes => {
        // TODO: crashes list seems to be returned in reverse
        // chronological order ... that's what we want, but not clear
        // if we can rely on that.  Add some .sort()-fu if we can't
        // rely on it.
        this.setState({ crashes });
      })
      .catch(err => console.error('Failed to fetch crash reports:', err));
  }

  onShowCrash = url => {
    if (this.state.useIframe) {
      this.setState({ crashUrl: url });
    } else {
      window.open(url);
    }
    return false;
  };

  onHideCrash = () => {
    this.setState({ crashUrl: '' });
  };

  onToggleIframe = () => {
    this.setState({ useIframe: !this.state.useIframe });
  }

  render() {
    let content;
    if (null === this.state.crashes) {
      content = (<div>Loading crash reports ...</div>);
    } else if (0 === this.state.crashes.length) {
      content = (<div>No crashes!!</div>);
    } else {
      content = this.state.crashes.map(crash => {
        let datetime = new Date(Date.parse(crash.timeStamp));
        return (
          <Link onClick={() => this.onShowCrash(crash.url)}>
            <ListGroupItem>
              {datetime.toString()}
            </ListGroupItem>
          </Link>
        );
      });
    }
    return (
      <div>
        <ButtonGroup>
          <Button bsStyle='warning'>
            <Link to='/'><Glyphicon glyph='home' /></Link>
          </Button>
          <Button bsStyle='info' onClick={this.onToggleIframe}>
            Open in {this.state.useIframe ? 'Window' : 'Frame'}
          </Button>
        </ButtonGroup>
        <ListGroup>
          {content}
        </ListGroup>

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
