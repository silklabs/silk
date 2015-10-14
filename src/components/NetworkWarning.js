import React from 'react-native';
let {
  NetInfo,
  View,
} = React;

import ErrorBar from './ErrorBar';

/**
 * Autonomous component that detects when there's no network availability and
 * displays a warning box.
 */
export default class NetworkWarning extends React.Component {

  state = {
    hasNetwork: true,
  };

  componentWillMount() {
    NetInfo.isConnected.fetch().then(this.onConnectivityChange);
    NetInfo.isConnected.addEventListener('change', this.onConnectivityChange);
  }

  componentWillUnmount() {
    NetInfo.isConnected.removeEventListener('change', this.onConnectivityChange);
  }

  onConnectivityChange = (hasNetwork) => {
    this.setState({hasNetwork});
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
