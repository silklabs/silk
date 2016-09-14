
import React from 'react';
import {
  Button,
  ControlLabel,
  DropdownButton,
  Form,
  FormControl,
  FormGroup,
  HelpBlock,
  MenuItem,
  Panel,
} from 'react-bootstrap';
import createLog from 'silk-log';
import Cameras from '../libraries/Cameras';

const log = createLog('datachannel');

const AVAILABLE_CHANNEL_NAMES = ['app', 'diag', 'video'];
const DEFAULT_CHANNEL_NAME = 'app';
const DEFAULT_CHANNEL_MESSAGE = 'time';

export default class DataChannel extends React.Component {

  state = {
    camera: null,
    channel: null,
    helpText: '',
    validationState: '',
    channelName: DEFAULT_CHANNEL_NAME,
    message: DEFAULT_CHANNEL_MESSAGE,
    payload: '',
    devicePayload: '',
  };

  constructor() {
    super();
    this.validate(this.state.message, this.state.payload);
  }

  get deviceId() {
    return this.props.params.deviceId;
  }

  componentWillMount() {
    Cameras.on('stateChanged', this.onCamerasStateChanged);
    this.onCamerasStateChanged(Cameras);
  }

  componentWillUnmount() {
    Cameras.removeListener('stateChanged', this.onCamerasStateChanged);
    this.onCamerasStateChanged({cameras: {}});
  }

  onCamerasStateChanged = camerasState => {
    let oldCamera = this.state.camera;
    let newCamera = camerasState.cameras[this.deviceId];

    if (oldCamera === newCamera) {
      return;
    }
    if (oldCamera) {
      oldCamera.removeListener('peer', this.onPeer);
      this.onPeer(null);
    }
    this.setState({camera: newCamera});
    if (newCamera) {
      newCamera.on('peer', this.onPeer);
      this.onPeer(newCamera.getPeer());
    }
  };

  onPeer = peer => {
    let channel = this.state.channel;
    if (channel && this.state.message.length > 0) {
      channel.removeListener(this.state.message, this.onDeviceMessage);
    }
    if (peer) {
      channel = peer.createChannel(
        this.state.channelName,
        {
          maxRetransmitTime: 1000,
        }
      );
      if (channel) {
        if (this.state.message.length > 0) {
          channel.on(this.state.message, this.onDeviceMessage);
        }
      }
    } else {
      channel = null;
    }
    this.setState({channel});
  };

  onSend = e => {
    if (this.state.validationState === 'success') {
      this.state.channel.emit(this.state.message, JSON.parse(this.state.payload));
    }
  };

  onDeviceMessage = payload => {
    this.setState({devicePayload: JSON.stringify(payload, null, ' ')});
  };

  validate(message, payload) {
    let validationState = 'success';
    let helpBlock = '';

    // eslint-disable-next-line no-constant-condition
    do {
      if (message.length === 0) {
        validationState = 'warning';
        helpBlock = 'Empty message';
        break;
      }
      if (payload.length === 0) {
        validationState = 'warning';
        helpBlock = 'Empty payload';
        break;
      }

      if (this.state.channel === null) {
        validationState = 'warning';
        helpBlock = 'Not connected to the device';
        break;
      }

      try {
        JSON.parse(payload);
      } catch (e) {
        validationState = 'error';
        helpBlock = e.toString();
      }
    } while (false);

    this.setState({message, payload, validationState, helpBlock});
  }

  onChangeMessage = e => {
    const message = e.target.value;
    const channel = this.state.channel;
    if (channel) {
      if (this.state.message.length > 0) {
        channel.removeListener(this.state.message, this.onDeviceMessage);
      }
      if (message.length > 0) {
        channel.on(message, this.onDeviceMessage);
      }
    }
    this.validate(message, this.state.payload);
    this.setState({devicePayload: ''});
  };

  onChangePayload = e => {
    const payload = e.target.value;
    this.validate(this.state.message, payload);
  };

  onSelectChannelName = channelName => {
    if (channelName !== this.state.channelName) {
      let channel = this.state.channel;
      if (channel) {
        if (this.state.message.length > 0) {
          channel.removeListener(this.state.message, this.onDeviceMessage);
        }
        channel.removeListener('error', this.onChannelError);
        channel.removeListener('close', this.onChannelClose);
        channel = null;
      }

      const peer = this.state.camera.getPeer();
      if (peer !== null) {
        if (this.state.message.length > 0) {
          channel = peer.createChannel(channelName);
          if (channel) {
            channel.on(this.state.message, this.onDeviceMessage);
            channel.on('error', this.onChannelError);
            channel.on('close', this.onChannelClose);
          } else {
            log.warn('Channel does not exist', channelName);
          }
        }
      }

      this.setState({channel, channelName, devicePayload: ''});
    }
  };

  onChannelError = (err) => {
    log.error('Got channel error:', err.stack || err);
  };

  onChannelClose = () => {
    log.warn('Got channel close');
    this.setState({channel: null});
  };

  render() {
    return (
      <div>
        <Form inline>
          <ControlLabel>Channel: </ControlLabel>
          <DropdownButton
            title={this.state.channelName}
            onSelect={this.onSelectChannelName}>
          {
            AVAILABLE_CHANNEL_NAMES.map(channelName =>
              <MenuItem eventKey={channelName}>{channelName}</MenuItem>
            )
          }
          </DropdownButton>
          &nbsp; &nbsp; &nbsp; &nbsp;
          <ControlLabel>Message:</ControlLabel>
          <FormControl
            value={this.state.message}
            type="text"
            placeholder="message"
            onChange={this.onChangeMessage}
          />
          &nbsp; &nbsp; &nbsp; &nbsp;
          <ControlLabel>{!this.state.channel && 'Channel not connected'}</ControlLabel>
        </Form>
        <Panel header="To Device">
          <form>
            <FormGroup
              controlId="toDeviceText"
              validationState={this.state.validationState}>
              <FormControl
                value={this.state.payload}
                componentClass="textarea"
                placeholder="Say something nice"
                onChange={this.onChangePayload}
              />
              <FormControl.Feedback />
              <HelpBlock>{this.state.helpBlock}</HelpBlock>
            </FormGroup>
            <Button onClick={this.onSend}>Send</Button>
          </form>
        </Panel>
        <Panel header="From Device">
          <pre>{this.state.devicePayload}</pre>
        </Panel>
      </div>
    );
  }
}
