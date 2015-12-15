import React from 'react';
import { Alert, Button, ButtonToolbar, Glyphicon, ProgressBar } from 'react-bootstrap';
import { Link } from 'react-router';
import Api from '../libraries/Api';

export default class FindCrashById extends React.Component {

  state = {
    crash: null,
    loading: true,
    error: null,
  };

  async findCrash() {
    try {
      const crashId = this.props.params.crashId;
      this.setState({loading: true});
      const crash = await Api.crash.findById(crashId);
      this.setState({loading: false, crash});

      // TODO: Would it be better to just jump to the crash directly, thusly?
      //window.location = crash.url;

    } catch (error) {
      this.setState({loading: false, error});
    }
  }

  componentWillMount() {
    this.findCrash();
  }

  render() {
    const crashId = this.props.params.crashId;
    let loadingMsg;
    if (this.state.loading) {
      loadingMsg = (
        <ProgressBar
          active
          bsSize="large"
          bsStyle="info"
          now={100}
          label={'Loading crash ' + crashId + '....'}
        />
      );
    }
    let errorMsg;
    if (this.state.error) {
      errorMsg = (
        <Alert bsStyle="danger">
          {this.state.error.message}
          <pre>{this.state.error.stack}</pre>
        </Alert>
      );
    }

    let crashInfo;
    if (this.state.crash) {
      const crash = this.state.crash;
      crashInfo = (
        <Alert bsStyle="success">
          <a href={crash.url}>Crash {crash.id}</a>
          <pre>{JSON.stringify(crash, null, '  ')}</pre>
        </Alert>
      );
    }
    return (
      <div>
        <ButtonToolbar>
          <Button bsStyle="warning">
            <Link to="/"><Glyphicon glyph="home" /></Link>
          </Button>
        </ButtonToolbar>
        {errorMsg}
        {loadingMsg}
        {crashInfo}
      </div>
    );
  }
}
