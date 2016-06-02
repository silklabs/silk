import React from 'react';
import {
  Image,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import createLog from 'silk-log';

import Button from '../Button';
import WifiNetworkIcon from './WifiNetworkIcon';
import WifiNetworkSelector from './WifiNetworkSelector';
import Selector from './Selector';
import SetupScreen from './SetupScreen';
import Spinner from '../Spinner';
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
     * Whether the user is picking the network from the
     * device-generated list or entering it manually.
     */
    manualEntry: false,

    /**
     * DeviceWifiNetwork network that's been automatically matched or
     * picked by the user from the `deviceNetworks` list.
     */
    selectedDeviceNetwork: null,

    /**
     * Network info manually entered by the user.
     */
    manualNetwork: null,

    /**
     * Wi-Fi passphrase, and whether it's visible or not.
     */
    secret: null,
    secretShown: false,

    wifiModalShown: false,
    authTypeModalShown: false,
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
        this.state.selectedDeviceNetwork !== null ||
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
      selectedDeviceNetwork: match,
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

    let selectedDeviceNetwork =
      deviceNetworks.find((network) => network.ssid === localWifiInfo.SSID);
    if (selectedDeviceNetwork) {
      log.debug('Found match based on SSID:', selectedDeviceNetwork);
      return selectedDeviceNetwork;
    }

    selectedDeviceNetwork = deviceNetworks.slice().sort((a, b) => b.level - a.level)[0];
    log.debug('Resorting to WiFi with strongest RSSI:', selectedDeviceNetwork);
    return selectedDeviceNetwork;
  }

  componentWillUnmount() {
    this.mounted = false;
    let { bleDeviceSession } = this.props;
    bleDeviceSession.removeListener('wifiscan', this._onDeviceNetworks);
  }

  _renderSSIDControls() {
    if (this.state.manualEntry) {
      const { manualNetwork } = this.state;
      return (
        <View style={styles.ssidRow}>
          <TextInput
            ref="ssid"
            placeholder="Enter Wi-Fi name"
            autoCorrect={false}
            autoCapitalize="none"
            value={manualNetwork.ssid}
            style={styles.textInput}
            onChangeText={(ssid) => this.setState({manualNetwork: {...manualNetwork, ssid}})}
          />
          <TouchableWithoutFeedback onPress={this._chooseFromList}>
            <Image
              source={require('image!wifi_return_to_list')}
              style={styles.icon}
            />
          </TouchableWithoutFeedback>
        </View>
      );
    }

    if (!this.state.attemptedWifiMatch) {
      return (
        <View style={styles.ssidRow}>
          <Text style={styles.ssidLabel}>Scanning...</Text>
          <Spinner color="white" />
        </View>
      );
    }
    let ssidRow = (
      <View style={styles.ssidRow}>
        <Text style={styles.ssidLabel}>
          Tap to select...
        </Text>
      </View>
    );
    const { selectedDeviceNetwork } = this.state;
    if (selectedDeviceNetwork) {
      ssidRow = (
        <View style={styles.ssidRow}>
          <Text numberOfLines={1} style={styles.ssidLabel}>
            {selectedDeviceNetwork.ssid}
          </Text>
          <WifiNetworkIcon
            level={selectedDeviceNetwork.level}
            secured={selectedDeviceNetwork.psk}
            size="large"
            tint="light"
          />
        </View>
      );
    }
    return (
      <TouchableWithoutFeedback onPress={this._showWifiModal}>
        {ssidRow}
      </TouchableWithoutFeedback>
    );
  }

  _renderSecretInputRow() {
    const { secretShown } = this.state;
    return (
      <View style={styles.secretRow}>
        <TextInput
          ref="secret"
          secureTextEntry={!secretShown}
          autoCorrect={false}
          autoCapitalize="none"
          placeholder="Enter Wi-Fi password"
          value={this.state.secret}
          style={styles.textInput}
          onChangeText={secret => this.setState({secret})}
        />
        <TouchableWithoutFeedback
          onPress={() => this.setState({secretShown: !this.state.secretShown})}>
          <Image
            source={require('image!visible')}
            style={[styles.icon, secretShown ? null : styles.disabledIcon]}
          />
        </TouchableWithoutFeedback>
      </View>
    );
  }

  _renderSecretControls() {
    if (this.state.manualEntry) {
      const { manualNetwork } = this.state;
      return (
        <View>
          <View style={styles.secretRow}>
            <TouchableWithoutFeedback onPress={this._showAuthTypeModal}>
              <Text style={styles.ssidLabel}>
                {manualNetwork && manualNetwork.psk ? 'WPA' : 'Open'}
              </Text>
            </TouchableWithoutFeedback>
          </View>
          {manualNetwork && manualNetwork.psk ? this._renderSecretInputRow() : null}
        </View>
      );
    }

    const { selectedDeviceNetwork } = this.state;
    if (!selectedDeviceNetwork) {
      return null;
    }
    if (selectedDeviceNetwork && selectedDeviceNetwork.psk) {
      return this._renderSecretInputRow();
    }
    return (
      <View style={styles.secretRow}>
        <Text>
          None
        </Text>
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
      selectedDeviceNetwork: network,
      wifiModalShown: false,
      secret: null,
    });
  };

  _scrollToSelectedWifiRow = () => {
    this.refs.wifiNetworkSelector.scrollToSelectedRow();
  };

  _enterManually = () => {
    log.debug('Entering Wi-Fi information manually.');
    this.setState({
      wifiModalShown: false,
      manualEntry: true,
      manualNetwork: {
        ssid: null,
        psk: true,
      },
      secret: null,
    });
  };

  _chooseFromList = () => {
    log.debug('Going back to choosing from a list.');
    this.setState({
      wifiModalShown: true,
      manualEntry: false,
      manualNetwork: null,
      secret: null,
    });
  }

  _renderWifiModal() {
    return (
      <Modal
        animationType="none"
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
          selectedNetwork={this.state.selectedDeviceNetwork}
          onSelectNetwork={this._selectNetwork}
          onSelectManually={this._enterManually}
          style={styles.wifiSelector}
        />
      </Modal>
    );
  }

  _showAuthTypeModal = () => {
    this.setState({authTypeModalShown: true});
  };

  _dismissAuthTypeModal = () => {
    this.setState({authTypeModalShown: false});
  };

  _onSelectAuthType = (psk) => {
    this.setState({
      manualNetwork: {
        ...this.state.manualNetwork,
        psk,
      },
      authTypeModalShown: false,
    });
  };

  _renderAuthTypeModal() {
    const { manualNetwork } = this.state;
    return (
      <Modal
        animationType="none"
        transparent={true}
        onRequestClose={this._dismissAuthTypeModal}
        visible={this.state.authTypeModalShown}>
        <TouchableWithoutFeedback onPress={this._dismissAuthTypeModal}>
          <View style={styles.unfocusView} />
        </TouchableWithoutFeedback>
        <Selector
          ref="authTypeSelector"
          style={styles.authTypeSelector}
          headerLabel="Wi-Fi Security Type">
          <Selector.Item
            label="WPA"
            selected={manualNetwork && manualNetwork.psk}
            onSelect={() => this._onSelectAuthType(true)}
          />
          <Selector.Item
            label="Open"
            selected={manualNetwork && !manualNetwork.psk}
            onSelect={() => this._onSelectAuthType(false)}
          />
        </Selector>
      </Modal>
    );
  }

  _handleSave = () => {
    const network = this.state.manualEntry ?
      this.state.manualNetork :
      this.state.selectedDeviceNetwork;
    const {manufacturer, model} = this.props.bleDeviceSession;
    this.props.onSave({
      deviceId: this.props.deviceSecret.deviceId,
      name: `${manufacturer} ${model}`,
      ssid: network.ssid,
      secret: network.psk ? this.state.secret : null,
    });
    this.props.navigator.pushAsync({
      name: 'DeviceStatus',
      props: this.props,
    });
  };

  render() {
    const network = this.state.manualEntry ?
      this.state.manualNetwork :
      this.state.selectedDeviceNetwork;
    const saveButtonDisabled =
      !network ||
      !network.ssid ||
      (network.psk && !this.state.secret) ||
      (network.psk && this.state.secret.length < 8);

    return (
      <SetupScreen
        title="Which Wi-Fi network should your device connect to?"
        subtitle="Your Wi-Fi password won't leave your house."
        secondaryButton={
          <Button
            type="secondary"
            onPress={this.props.onCancel}
            label="Cancel"
            style={styles.cancelButton}
          />
        }
        primaryButton={
          <Button
            type="primary"
            onPress={this._handleSave}
            label="Save"
            style={styles.saveButton}
            disabled={saveButtonDisabled}
          />
        }>
        {this._renderSSIDControls()}
        {this._renderSecretControls()}
        {this._renderWifiModal()}
        {this._renderAuthTypeModal()}
      </SetupScreen>
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
    marginVertical: 8,
    paddingVertical: 8,
    borderBottomWidth: 3,
    borderBottomColor: 'white',
  },
  ssidLabel: {
    fontFamily: 'Open Sans',
    fontSize: 18,
    color: 'white',
    flex: 1,
    backgroundColor: 'transparent',
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
  authTypeSelector: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderWidth: 1,
    borderColor: 'rgba(66, 66, 66, 0.05)',
    borderRadius: 4,
    shadowColor: 'black',
    shadowOpacity: 0.5,
    shadowRadius: 10,
    marginHorizontal: 10,
    marginTop: 96,
  },
  icon: {
    width: 32,
    height: 32,
  },
  disabledIcon: {
    opacity: 0.5,
  },
  textInput: {
    color: 'white',
    height: 32,
    fontFamily: 'Open Sans',
    fontSize: 18,
    flex: 1,
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
