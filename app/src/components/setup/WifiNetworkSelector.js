/**
 * @flow
 */

import React from 'react';
import { View } from 'react-native';
import Selector from './Selector';
import WifiNetworkIcon from './WifiNetworkIcon';

const deviceNetworkPropType = React.PropTypes.shape({
  ssid: React.PropTypes.string.isRequired,
  psk: React.PropTypes.bool.isRequired,
  level: React.PropTypes.number.isRequired,
});

export default class WifiNetworkSelector extends React.Component {

  static propTypes = {
    deviceNetworks: React.PropTypes.arrayOf(deviceNetworkPropType),
    selectedNetwork: deviceNetworkPropType,
    style: View.propTypes.style,
    onSelectNetwork: React.PropTypes.func.isRequired,
    onSelectManually: React.PropTypes.func.isRequired,
  };

  scrollToSelectedRow() {
    this.refs.selector.scrollToSelectedRow();
  }

  _renderRow = (network) => {
    const { selectedNetwork } = this.props;
    const key = `${network.ssid}\0${network.psk}`;
    const selected =
      !!selectedNetwork &&
      network.ssid === selectedNetwork.ssid &&
      network.psk === selectedNetwork.psk;
    return (
      <Selector.Item
        key={key}
        label={network.ssid}
        selected={selected}
        onSelect={() => this.props.onSelectNetwork(network)}
        icon={
          <WifiNetworkIcon
            level={network.level}
            secured={network.psk}
            size="small"
            tint="dark"
          />
        }
      />
    );
  };

  render() {
    const { deviceNetworks } = this.props;
    let deviceNetworkList;
    if (!deviceNetworks) {
      deviceNetworkList = (
        <Selector.Item
          label="Scanning..."
          disabled={true}
        />
      );
    } else if (deviceNetworks.length === 0) {
      deviceNetworkList = (
        <Selector.Item
          label="No Wi-Fi networks found."
          disabled={true}
        />
      );
    } else {
      deviceNetworkList = deviceNetworks.map(this._renderRow);
    }
    return (
      <Selector
        ref="selector"
        style={this.props.style}
        headerLabel="Networks"
        footerLabel="Enter manually..."
        onFooterPress={this.props.onSelectManually}>
        {deviceNetworkList}
      </Selector>
    );
  }

}
