import React from 'react';
import {
  PixelRatio,
  ScrollView,
  StyleSheet,
  Text,
  TouchableHighlight,
  View,
} from 'react-native';
import { Colors } from '../CommonStyles';

export default class WifiNetworkSelector extends React.Component {

  static propTypes = {
    deviceNetworks: React.PropTypes.arrayOf(React.PropTypes.shape({
      bssid: React.PropTypes.string.isRequired,
      ssid: React.PropTypes.string.isRequired,
      psk: React.PropTypes.bool.isRequired,
      level: React.PropTypes.number.isRequired,
    })),
    currentBSSID: React.PropTypes.string,
    style: View.propTypes.style,
    onSelectNetwork: React.PropTypes.func.isRequired,
    onSelectManually: React.PropTypes.func.isRequired,
  };

  _scrollViewHeight = null;
  _contentsHeight = null;
  _selectedRowY = null;

  _onScrollViewLayout = (event) => {
    this._scrollViewHeight = event.nativeEvent.layout.height;
  };

  _onContentSizeChange = (width, height) => {
    this._contentsHeight = height;
  };

  _onLayoutSelectedRow = (event) => {
    this._selectedRowY = event.nativeEvent.layout.y;
  };

  scrollToSelectedRow() {
    if (this._scrollViewHeight === null ||
        this._contentsHeight === null ||
        this._selectedRowY === null) {
      return;
    }
    // Scroll to the selected WiFi row so that it's displaced in the
    // center of the screen. Though if it's near the bottom of the
    // list, don't scroll past the end of the list. Similar, if it's
    // at the start of the list, don't scroll negatively.
    this.refs.scrollView.scrollTo({
      y: Math.max(
        0,
        Math.min(
          this._selectedRowY - this._scrollViewHeight / 2,
          this._contentsHeight - this._scrollViewHeight
        )
      ),
    });
  }

  _renderRow = (network) => {
    const selected = network.bssid === this.props.currentBSSID;
    return (
      <TouchableHighlight
        key={network.bssid}
        underlayColor="white"
        onLayout={selected ? this._onLayoutSelectedRow : null}
        onPress={() => this.props.onSelectNetwork(network)}>
        <View
          style={[styles.row, selected ? styles.selectedRow : null]}>
          <Text style={[styles.rowLabel, selected ? styles.selectedRowLabel : null]}>
            {network.ssid}
          </Text>
          <Text style={[styles.rowLabel, selected ? styles.selectedRowLabel : null]}>
            ({network.level})
          </Text>
        </View>
      </TouchableHighlight>
    );
  };

  render() {
    const { deviceNetworks } = this.props;
    let deviceNetworkList;
    if (!deviceNetworks) {
      deviceNetworkList = (
        <Text>Scanning...</Text>
      );
    } else if (deviceNetworks.length === 0) {
      deviceNetworkList = (
        <Text>No Wi-Fi networks found.</Text>
      );
    } else {
      deviceNetworkList = deviceNetworks.map(this._renderRow);
    }
    return (
      <ScrollView
        style={this.props.style}
        ref="scrollView"
        onLayout={this._onScrollViewLayout}
        onContentSizeChange={this._onContentSizeChange}>
        <View style={[styles.row, styles.header]}>
          <Text style={styles.headerLabel}>
            Networks
          </Text>
        </View>
        {deviceNetworkList}
        <TouchableHighlight
          underlayColor="white"
          onPress={this.props.onSelectManually}>
          <View style={[styles.row, styles.enterManually]}>
            <Text style={styles.enterManuallyLabel}>
              Enter manually...
            </Text>
          </View>
        </TouchableHighlight>
      </ScrollView>
    );
  }

}

const styles = StyleSheet.create({
  header: {
    borderBottomColor: Colors.SilkLabsBlack,
  },
  headerLabel: {
    color: Colors.SilkLabsBlack50,
    fontFamily: 'DIN Round Pro',
    fontSize: 14,
    fontWeight: '600',
  },
  row: {
    flexDirection: 'row',
    height: 40,
    alignItems: 'center',
    paddingLeft: 12,
    paddingRight: 30,
    justifyContent: 'space-between',
    borderBottomWidth: 1 / PixelRatio.get(),
    borderBottomColor: Colors.SilkLabsBlack50,
  },
  rowLabel: {
    color: Colors.SilkLabsBlack,
    fontFamily: 'DIN Round Pro',
    fontSize: 14,
    fontWeight: '600',
  },
  selectedRow: {
    backgroundColor: 'white',
  },
  selectedRowLabel: {
    color: Colors.SilkLabsBlue,
  },
  enterManually: {
    height: 50,
    borderBottomWidth: 0,
    borderTopWidth: 1,
    borderTopColor: Colors.SilkLabsBlack,
  },
  enterManuallyLabel: {
    color: Colors.SilkLabsBlack50,
    fontFamily: 'DIN Round Pro',
    fontSize: 14,
  },
});
