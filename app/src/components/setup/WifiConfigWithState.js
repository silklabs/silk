import React from 'react';
import { connect, Provider } from 'react-redux';

import WifiConfig from './WifiConfig';
import wifiStore from '../../store/wifi_store';
import * as wifiActions from '../../store/wifi_actions';

function mapStateToProps(state) {
  // Store state becomes props.
  return state;
}

function mapDispatchToProps(dispatch) {
  return {
    clearState: () => dispatch(wifiActions.clearState()),
    getLocalWifiInfo: () => dispatch(wifiActions.getLocalInfo()),
    onDeviceWifiScan: (deviceNetworks) => dispatch(
      wifiActions.updateDeviceNetworks(deviceNetworks)
    ),
    onDeviceNetworkSelected: (deviceNetwork) => dispatch(
      wifiActions.setNetwork(deviceNetwork)
    ),
    onSelectEnterManually: () => dispatch(wifiActions.enterManually()),
    onSelectChooseFromDeviceList: () => dispatch(wifiActions.selectFromList()),
    onSecretChange: (secret) => dispatch(wifiActions.setSecret(secret)),
    onManualNetworkSSIDChange: (ssid) => dispatch(wifiActions.setManualSSID(ssid)),
    onManualNetworkPSKChange: (psk) => dispatch(wifiActions.setManualPSK(psk)),
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
