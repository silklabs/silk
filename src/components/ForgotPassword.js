
import Config from '../libraries/Config';
import React from 'react';
import { Alert, ButtonInput, Panel, Input, Row, Col } from 'react-bootstrap';
import qs from 'querystring';

export default class ForgotPassword extends React.Component {
  static propTypes = {
    history: React.PropTypes.object.isRequired,
    location: React.PropTypes.object.isRequired,
    route: React.PropTypes.shape({
      api: React.PropTypes.object.isRequired,
    }),
  };

  constructor(...args) {
    super(...args);
    // We use href to support both the hash variant and the absolute url variant.
    let query = window.location.href.split('?').pop();
    let parsed = qs.parse(query);

    this.state = { email: parsed.email, token: parsed.token };
    console.log('Running password reset for', parsed.email);
  }

  resetForm = () => {
    this.setState({
      alertMessage: null,
      submitDisabled: true,
    });

    if (Config.defaultUser && Config.defaultPassword) {
      this.setState({ submitDisabled: false });
    }
  }

  doPasswordReset = async(password) => {
    try {
      let {userState} = this.props.route;
      let {success} = await userState.resetPassword(
        this.state.email, this.state.token, password
      );
      if (!success) {
        throw new Error('Unable to reset password...');
      }
      this.setState({ alertMessage: 'Successfully reset password' });
    } catch (err) {
      console.error(err.stack);
      this.setState({ alertMessage: err.message, submitDisabled: false });
    } finally {
      this.setState({ signingIn: false });
    }
  }

  componentWillMount() {
    this.resetForm();
  }

  handleSubmit = (event) => {
    event.preventDefault();
    this.setState({ signingIn: true, submitDisabled: true });

    const pass = this.refs.pass.getValue();
    this.doPasswordReset(pass);
  }

  handleChange = () => {
    const pass = this.refs.pass.getValue();
    // Don't bother the server for clearly invalid emails and passwords
    this.setState({ submitDisabled: pass.length < 4 });
  }

  render() {
    const panelStyle = {maxWidth: 400, margin: '10px auto 10px'};
    return (
      <Panel style={panelStyle}>
        {this.state.alertMessage && (
          <Alert bsStyle="danger">{this.state.alertMessage}</Alert>
        )}
        <form onSubmit={this.handleSubmit}>
          <Input
            type="password"
            ref="pass"
            defaultValue={Config.defaultPassword}
            placeholder="New Password"
            onChange={this.handleChange}
          />
          <Row>
            <Col xs={6}>
              <ButtonInput
                type="submit"
                bsStyle="primary"
                value={this.state.signingIn ? 'Changing password...' : 'Reset password'}
                disabled={this.state.submitDisabled}
              />
            </Col>
          </Row>
        </form>
      </Panel>
    );
  }
}
