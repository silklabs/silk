import React from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import createLog from 'silk-log';

import Button from './Button';
import WifiNetworkIcon from './WifiNetworkIcon';
import WifiNetworkSelector from './WifiNetworkSelector';
import Spinner from '../Spinner';
import { SetupStyles } from '../CommonStyles';
import { getWifiInfo } from '../../libraries/Util';
import { DeviceSession } from '../../libraries/ble/DeviceManager';

import type { DeviceWifiNetwork } from '../../libraries/ble/DeviceManager';
import type { WifiInfo } from '../../libraries/Util.js';

const log = createLog('WifiConfig');

const SENTINEL = {};

export default class WifiConfig extends React.Component {

  static propTypes = {
    bleDeviceSession: React.PropTypes.instanceOf(DeviceSession).isRequired,
    deviceSecret: React.PropTypes.shape({
      deviceId: React.PropTypes.string.isRequired,
    }).isRequired,
    onSave: React.PropTypes.func.isRequired,
    onCancel: React.PropTypes.func.isRequired,
  };

  state = {
    /**
     * Possible values:
     * - SENTINEL: we don't have that info yet
     * - null: the phone is connected to Wifi
     * - WifiInfo object
     */
    localWifiInfo: SENTINEL,

    /**
     * An array of DeviceWifiNetwork objects, or null if we don't have that info yet.
     */
    deviceNetworks: null,

    /**
     * Whether or not we've attempted to match the phone's local WiFi
     * info yet with any of the networks seen by the device.
     */
    attemptedWifiMatch: false,

    /**
     * Current user inputs
     */
    bssid: null,
    ssid: null,
    psk: true,
    level: null,
    secret: '',
    secretShown: false,

    wifiModalShown: false,
  };

  mounted = false;

  componentWillMount() {
    this.mounted = true;

    let { bleDeviceSession } = this.props;
    bleDeviceSession.on('wifiscan', this._onDeviceNetworks);
    log.debug('Initial device networks:', bleDeviceSession.wifiNetworks);
    this._onDeviceNetworks(bleDeviceSession.wifiNetworks);

    getWifiInfo().then(this._onLocalWifiInfo);
  }

  _onLocalWifiInfo: ((localWifiInfo: WifiInfo) => void) = (localWifiInfo) => {
    log.debug('Local device WiFi connection', localWifiInfo);
    this._reconcileWifiSources(this.state.deviceNetworks, localWifiInfo);
  };

  _onDeviceNetworks: ((deviceNetworks: ?Array<DeviceWifiNetwork>) => void) = (deviceNetworks) => {
    if (!this.mounted) {
      return;
    }
    if (!deviceNetworks) {
      return;
    }

    // Sort alphabetically by SSID.
    deviceNetworks = deviceNetworks
      .slice()
      .sort((a, b) => a.ssid.localeCompare(b.ssid));
    this._reconcileWifiSources(deviceNetworks, this.state.localWifiInfo);
  };

  _reconcileWifiSources(
    deviceNetworks: ?Array<DeviceWifiNetwork>,
    localWifiInfo: ?WifiInfo,
  ) {
    // If we have gotten a match before, or a manual entry, or if we
    // don't have all info yet, don't try to do any matching. But do
    // set newer values for either device or local WiFi info.
    if (this.state.attemptedWifiMatch ||
        this.state.ssid !== null ||
        localWifiInfo === SENTINEL ||
        deviceNetworks === null) {
      if (this.state.localWifiInfo !== localWifiInfo ||
          this.state.deviceNetworks !== deviceNetworks) {
        this.setState({localWifiInfo, deviceNetworks});
      }
      return;
    }

    // We're trying to find the best match between local and device
    // WiFi info (for the first and only time.) Even if there's no
    // match we want to set newer values for either device or local
    // WiFi info and update the UI to indicate that we're done trying
    // to figure out the best match.
    const match = this._findBestWifiMatch(deviceNetworks, localWifiInfo);
    if (!match) {
      log.debug('Could not find a match for WiFi networks.');
      this.setState({deviceNetworks, localWifiInfo, attemptedWifiMatch: true});
      return;
    }

    log.debug('Found a match for the WiFi network:', match.ssid);
    this.setState({
      deviceNetworks,
      localWifiInfo,
      attemptedWifiMatch: true,
      bssid: match.bssid,
      ssid: match.ssid,
      psk: match.psk,
      level: match.level,
    });
  }

  _findBestWifiMatch(
    deviceNetworks: Array<DeviceWifiNetwork>,
    localWifiInfo: ?WifiInfo,
  ): ?DeviceWifiNetwork {
    if (!deviceNetworks.length) {
      return null;
    }

    // Return strongest WiFi seen by device if the phone isn't
    // connected to any WiFi network.
    if (!localWifiInfo) {
      log.debug('No WiFi information from local device.');
      return deviceNetworks.slice().sort((a, b) => b.level - a.level)[0];
    }

    let matchedNetwork =
      deviceNetworks.find((network) => network.bssid === localWifiInfo.BSSID);
    if (matchedNetwork) {
      log.debug('Found match based on BSSID:', matchedNetwork);
      return matchedNetwork;
    }

    matchedNetwork =
      deviceNetworks.find((network) => network.ssid === localWifiInfo.SSID);
    if (matchedNetwork) {
      log.debug('Found match based on SSID:', matchedNetwork);
      return matchedNetwork;
    }

    matchedNetwork = deviceNetworks.slice().sort((a, b) => b.level - a.level)[0];
    log.debug('Resorting to WiFi with strongest RSSI:', matchedNetwork);
    return matchedNetwork;
  }

  componentWillUnmount() {
    this.mounted = false;
    let { bleDeviceSession } = this.props;
    bleDeviceSession.removeListener('wifiscan', this._onDeviceNetworks);
  }

  _renderSSIDControls() {
    const { attemptedWifiMatch, ssid, level } = this.state;
    if (!attemptedWifiMatch) {
      return (
        <View style={styles.ssidRow}>
          <Text style={styles.ssidLabel}>Scanning...</Text>
          <Spinner color="white" />
        </View>
      );
    }
    return (
      <TouchableWithoutFeedback onPress={this._showWifiModal}>
        <View style={styles.ssidRow}>
          <Text numberOfLines={1} style={styles.ssidLabel}>
            {ssid}
          </Text>
          <WifiNetworkIcon
            level={level}
            size="large"
            tint="light"
          />
        </View>
      </TouchableWithoutFeedback>
    );
  }

  _renderSecretControls() {
    const { psk, secretShown } = this.state;
    return (
      <View style={styles.secretRow}>
        <TextInput
          ref="secret"
          secureTextEntry={!secretShown}
          placeholder={psk ? 'Enter WiFi password' : 'None'}
          editable={psk}
          clearButtonMode="always"
          value={psk ? this.state.secret : ''}
          style={SetupStyles.formInput}
          onChangeText={secret => this.setState({secret})}
        />
        <Switch
          value={secretShown}
          onValueChange={secretShown => this.setState({secretShown})}
        />
      </View>
    );
  }

  _showWifiModal = () => {
    this.setState({wifiModalShown: true});
  };

  _dismissWifiModal = () => {
    this.setState({wifiModalShown: false});
  };

  _selectNetwork = (network) => {
    this.setState({
      ssid: network.ssid,
      psk: network.psk,
      wifiModalShown: false,
    });
  };

  _scrollToSelectedWifiRow = () => {
    this.refs.wifiNetworkSelector.scrollToSelectedRow();
  };

  _enterManually = () => {
    // TODO
  };

  _renderWifiModal() {
    return (
      <Modal
        animated={false}
        transparent={true}
        onShow={this._scrollToSelectedWifiRow}
        onRequestClose={this._dismissWifiModal}
        visible={this.state.wifiModalShown}>
        <TouchableWithoutFeedback onPress={this._dismissWifiModal}>
          <View style={styles.unfocusView} />
        </TouchableWithoutFeedback>
        <WifiNetworkSelector
          ref="wifiNetworkSelector"
          deviceNetworks={this.state.deviceNetworks}
          currentBSSID={this.state.bssid}
          onSelectNetwork={this._selectNetwork}
          onSelectManually={this._enterManually}
          style={styles.wifiSelector}
        />
      </Modal>
    );
  }

  _handleSave = () => {
    this.props.onSave({
      deviceId: this.props.deviceSecret.deviceId,
      name: `${this.props.bleDeviceSession.manufacturer} ${this.props.bleDeviceSession.model}`,
      ssid: this.state.ssid,
      secret: this.state.psk ? this.state.secret : null,
    });
    this.props.navigator.pushAsync({
      name: 'DeviceStatus',
      props: this.props,
    });
  };

  render() {
    const saveButtonDisabled =
      !this.state.ssid || (this.state.psk && this.state.secret.length < 8);

    return (
      <ScrollView
        style={SetupStyles.container}
        keyboardShouldPersistTaps={false}
        alwaysBounceVertical={false}
        scrollable={false}>
        <Text style={SetupStyles.title}>
          Which Wi-Fi network should your device connect to?
        </Text>
        <Text style={SetupStyles.subtitle}>
          Your Wi-Fi password won{"'"}t leave your house.
        </Text>
        {this._renderSSIDControls()}
        {this._renderSecretControls()}
        {this._renderWifiModal()}
        <View style={{flex: 1}} />
        <View style={styles.buttonRow}>
          <Button
            type="secondary"
            onPress={this.props.onCancel}
            label="Cancel"
            style={styles.cancelButton}
          />
          <Button
            type="primary"
            onPress={this._handleSave}
            label="Save"
            style={styles.saveButton}
            disabled={saveButtonDisabled}
          />
        </View>
      </ScrollView>
    );
  }

}

const styles = StyleSheet.create({
  unfocusView: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
  },
  ssidRow: {
    flexDirection: 'row',
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginVertical: 8,
    paddingVertical: 8,
    borderBottomWidth: 3,
    borderBottomColor: 'white',
  },
  ssidLabel: {
    fontFamily: 'Open Sans',
    fontSize: 18,
    color: 'white',
  },
  secretRow: {
    flexDirection: 'row',
    marginVertical: 8,
    borderBottomWidth: 3,
    borderBottomColor: 'white',
  },
  wifiSelector: {
    position: 'absolute',
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderWidth: 1,
    borderColor: 'rgba(66, 66, 66, 0.05)',
    borderRadius: 4,
    shadowColor: 'black',
    shadowOpacity: 0.5,
    shadowRadius: 10,
    top: 60,
    left: 10,
    right: 10,
    bottom: 100,
  },
  buttonRow: {
    flexDirection: 'row',
    marginTop: 16,
  },
  cancelButton: {
    marginRight: 8,
  },
  saveButton: {
    marginLeft: 8,
  },
});
