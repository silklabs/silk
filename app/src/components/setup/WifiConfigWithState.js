import React from 'react';
import { connect, Provider } from 'react-redux';

import WifiConfig from './WifiConfig';
import wifiStore from '../../stores/wifi';
import * as wifiActions from '../../actions/wifi';

function mapStateToProps(state) {
  // Store state becomes props.
  return state;
}

function mapDispatchToProps(dispatch) {
  return {
    clearState: () => dispatch(wifiActions.clearState()),
    getLocalWifiInfo: () => dispatch(wifiActions.getLocalWifiInfo()),
    onDeviceWifiScan: (deviceNetworks) => dispatch(
      wifiActions.scannedDeviceNetworks(deviceNetworks)
    ),
    onDeviceNetworkSelected: (deviceNetwork) => dispatch(
      wifiActions.selectDeviceNetwork(deviceNetwork)
    ),
    onSelectEnterManually: () => dispatch(wifiActions.selectEnterManually()),
    onSelectChooseFromDeviceList: () => dispatch(
      wifiActions.selectChooseFromDeviceList()
    ),
    onSecretChange: (secret) => dispatch(wifiActions.changeSecret(secret)),
    onManualNetworkSSIDChange: (ssid) => dispatch(
      wifiActions.changeManualNetworkSSID(ssid)
    ),
    onManualNetworkPSKChange: (psk) => dispatch(
      wifiActions.changeManualNetworkPSK(psk)
    ),
  };
}

const WifiConfigWithState = connect(
  mapStateToProps,
  mapDispatchToProps
)(WifiConfig);

export default class Wifi extends React.Component {

  render() {
    return (
      <Provider store={wifiStore}>
        <WifiConfigWithState {...this.props} />
      </Provider>
    );
  }

}
