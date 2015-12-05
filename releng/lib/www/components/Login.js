
import React from 'react';
import { Alert, ButtonInput, Panel, Input, Row, Col } from 'react-bootstrap';

const Config = {
/*
  defaultUser: 'mvines',
  defaultPassword: '',
*/
};

export default class Login extends React.Component {
  static propTypes = {
    history: React.PropTypes.object.isRequired,
    location: React.PropTypes.object.isRequired,
    route: React.PropTypes.shape({
      userState: React.PropTypes.object.isRequired,
    }),
  };

  resetForm = () => {
    this.setState({
      alertMessage: null,
      submitDisabled: true,
      signingIn: false,
    });
    if (Config.defaultUser && Config.defaultPassword) {
      this.setState({ submitDisabled: false });
    }
  };

  doSignOut = async () => {
    await this.props.route.userState.signOut();
  };

  doSignIn = async(user, pass) => {
    try {
      let success = await this.props.route.userState.attemptSignIn(user, pass);

      if (!success) {
        throw new Error('Unable to sign in. Check username and password.');
      }
      const { history, location } = this.props;
      if (location.state && location.state.nextPathname) {
        history.replaceState(null, location.state.nextPathname);
      } else {
        history.replaceState(null, '/');
      }
    } catch (err) {
      this.setState({ alertMessage: err.message });
      this.setState({ signingIn: false, submitDisabled: false});
    }
  };

  componentWillMount() {
    this.doSignOut();
    this.resetForm();
  }

  handleSubmit = (event) => {
    event.preventDefault();
    this.setState({ signingIn: true, submitDisabled: true });

    const user = this.refs.user.getValue();
    const pass = this.refs.pass.getValue();
    this.doSignIn(user, pass);
  };

  handleChange = () => {
    const user = this.refs.user.getValue();
    const pass = this.refs.pass.getValue();
    // Don't bother the server for clearly invalid users and passwords
    this.setState({ submitDisabled: user.length < 3 || pass.length < 4 });
  };

  render() {
    const panelStyle = {maxWidth: 400, margin: '10px auto 10px'};
    return (
      <Panel style={panelStyle}>
        {this.state.alertMessage && (
          <Alert bsStyle="danger">{this.state.alertMessage}</Alert>
        )}
        <form onSubmit={this.handleSubmit}>
          <Input
            type="text"
            ref="user"
            defaultValue={Config.defaultUser}
            placeholder="Github Username"
            onChange={this.handleChange}
          />
          <Input
            type="password"
            ref="pass"
            defaultValue={Config.defaultPassword}
            placeholder="Github Password"
            onChange={this.handleChange}
          />
          <Row>
            <Col xs={6}>
              <ButtonInput
                type="submit"
                bsStyle="primary"
                value={this.state.signingIn ? 'Signing In...' : 'Sign In'}
                disabled={this.state.submitDisabled}
              />
            </Col>
            <Col xs={6}>
              <ButtonInput
                type="reset"
                bsStyle="warning"
                value="Reset"
                onClick={this.resetForm}
              />
            </Col>
          </Row>
        </form>
      </Panel>
    );
  }
}

