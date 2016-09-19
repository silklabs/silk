/**
 * @flow
 */

import PureRenderMixin from 'react-addons-pure-render-mixin';
import createLog from 'silk-log';

import AsyncComponent from './AsyncComponent';

import type {RegisteredDevice} from 'silk-app-client/src/store/device_reducers';
import type {Peer} from 'silk-rtc';

const log = createLog('WebRTCDataChannelReceiver');

// TODO: we might want to add an eslint plugin that understands more Flow.
// eslint-disable-next-line no-undef
interface Props {
  device: RegisteredDevice;
}

export default class WebRTCDataChannelReceiver<P: Props> extends AsyncComponent {

  shouldComponentUpdate = PureRenderMixin.shouldComponentUpdate;

  props: P;
  mounted: boolean = false;

  componentWillMount() {
    this.mounted = true;
    const {peer} = this.props.device.rtc;
    if (peer) {
      this.subscribeToRTC(peer);
    }
  }

  componentWillUnmount() {
    this.mounted = false;
    const {peer} = this.props.device.rtc;
    this.unsubscribeFromRTC(peer);
  }

  componentWillReceiveProps(nextProps: P) {
    const {peer} = this.props.device.rtc;
    const nextPeer = nextProps.device.rtc.peer;
    if (peer !== nextPeer) {
      this.unsubscribeFromRTC(peer);
      this.subscribeToRTC(nextPeer);
    }
  }

  subscribeToRTC(peer: ?Peer) {
    if (!peer) {
      log.debug('No peer');
      return;
    }
    const channel = peer.createChannel(
      this.channelName,
      {
        maxRetransmitTime: 1000,
      }
    );
    channel.on(this.messageType, this.onMessage);
  }

  unsubscribeFromRTC(peer: ?Peer) {
    if (!peer) {
      log.debug('No peer');
      return;
    }
    const channel = peer.getChannel(this.channelName);
    if (!channel) {
      log.debug('Channel does not exist:', this.channelName);
      return;
    }
    channel.removeListener(this.messageType, this.onMessage);
  }

  onMessage(message: any) {
    throw new Error('Not implemented');
  }

}
