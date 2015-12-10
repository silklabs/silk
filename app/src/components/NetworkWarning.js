import React from 'react-native';
import { SilkApi } from 'silk-api';

import AsyncComponent from './AsyncComponent';
import ErrorBar from './ErrorBar';

const {
  NetInfo,
  View,
} = React;

/**
 * Autonomous component that detects when there's no network availability and
 * displays a warning box.
 */
export default class NetworkWarning extends AsyncComponent {

  static propTypes = {
    api: React.PropTypes.instanceOf(SilkApi).isRequired,
  };

  state = {
    hasNetwork: true,
  };

  componentWillMount() {
    this.onConnectivityChange();
    NetInfo.isConnected.addEventListener('change', this.onConnectivityChange);
  }

  componentWillUnmount() {
    NetInfo.isConnected.removeEventListener('change', this.onConnectivityChange);
  }

  onConnectivityChange = async () => {
    // Use the API to figure out whether we can talk to our server or not.
    // That's what matters to us, not whether the OS thinks we have interwebs.
    let hasNetwork = await this.props.api.canReachServer();
    this.setStateAsync({hasNetwork});
  };

  render() {
    if (this.state.hasNetwork) {
      return <View />;
    }
    return (
      <ErrorBar
        heading="Network Connection Unavailable"
        description="Please check your data or WiFi connection."
      />
    );
  }
}
