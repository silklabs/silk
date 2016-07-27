import React from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import {DeviceSession} from 'silk-app-sdk/src/ble/device_manager';
import createLog from 'silk-log';

import Button from '../Button';
import WifiNetworkIcon from './WifiNetworkIcon';
import WifiNetworkSelector from './WifiNetworkSelector';
import Selector from './Selector';
import SetupScreen from './SetupScreen';

const log = createLog('WifiConfig');

export default class WifiConfig extends React.Component {

  static propTypes = {
    bleDeviceSession: React.PropTypes.instanceOf(DeviceSession).isRequired,
    onSave: React.PropTypes.func.isRequired,
    onCancel: React.PropTypes.func.isRequired,

    localWifiInfo: React.PropTypes.object,
    deviceNetworks: WifiNetworkSelector.propTypes.deviceNetworks,
    attemptedWifiMatch: React.PropTypes.bool.isRequired,
    selectedDeviceNetwork: WifiNetworkSelector.propTypes.selectedNetwork,
    manualEntry: React.PropTypes.bool.isRequired,
    manualNetwork: React.PropTypes.object,
    secret: React.PropTypes.string.isRequired,

    clearState: React.PropTypes.func.isRequired,
    getLocalWifiInfo: React.PropTypes.func.isRequired,
    onDeviceWifiScan: React.PropTypes.func.isRequired,
    onDeviceNetworkSelected: React.PropTypes.func.isRequired,
    onSelectEnterManually: React.PropTypes.func.isRequired,
    onSelectChooseFromDeviceList: React.PropTypes.func.isRequired,
    onSecretChange: React.PropTypes.func.isRequired,
    onManualNetworkSSIDChange: React.PropTypes.func.isRequired,
    onManualNetworkPSKChange: React.PropTypes.func.isRequired,
  };

  state = {
    secretShown: false,
    wifiModalShown: false,
    authTypeModalShown: false,
  };

  componentWillMount() {
    let { bleDeviceSession } = this.props;
    bleDeviceSession.on('wifiscan', this.props.onDeviceWifiScan);
    log.debug('Initial device networks:', bleDeviceSession.wifiNetworks);
    this.props.onDeviceWifiScan(bleDeviceSession.wifiNetworks);
    this.props.getLocalWifiInfo();
  }

  componentWillUnmount() {
    let { bleDeviceSession } = this.props;
    bleDeviceSession.removeListener('wifiscan', this.props.onDeviceWifiScan);
    this.props.clearState();
  }

  _renderSSIDControls() {
    if (this.props.manualEntry) {
      const { manualNetwork } = this.props;
      return (
        <View style={styles.ssidRow}>
          <TextInput
            ref="ssid"
            placeholder="Enter Wi-Fi name"
            autoCorrect={false}
            autoCapitalize="none"
            value={manualNetwork.ssid}
            style={styles.textInput}
            onChangeText={this.props.onManualNetworkSSIDChange}
          />
          <TouchableWithoutFeedback onPress={this._chooseFromList}>
            <Image
              source={require('../../assets/wifi_return_to_list.png')}
              style={styles.icon}
            />
          </TouchableWithoutFeedback>
        </View>
      );
    }

    if (!this.props.attemptedWifiMatch) {
      return (
        <View style={styles.ssidRow}>
          <Text style={styles.ssidLabel}>Scanning...</Text>
          <ActivityIndicator color="white" />
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
    const { selectedDeviceNetwork } = this.props;
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
          value={this.props.secret}
          style={styles.textInput}
          onChangeText={this.props.onSecretChange}
        />
        <TouchableWithoutFeedback
          onPress={() => this.setState({secretShown: !this.state.secretShown})}>
          <Image
            source={require('../../assets/visible.png')}
            style={[styles.icon, secretShown ? null : styles.disabledIcon]}
          />
        </TouchableWithoutFeedback>
      </View>
    );
  }

  _renderSecretControls() {
    if (this.props.manualEntry) {
      const { manualNetwork } = this.props;
      return (
        <View>
          <View style={styles.secretRow}>
            <TouchableWithoutFeedback onPress={this._showAuthTypeModal}>
              <View>
                <Text style={styles.ssidLabel}>
                  {manualNetwork && manualNetwork.psk ? 'WPA' : 'Open'}
                </Text>
              </View>
            </TouchableWithoutFeedback>
          </View>
          {manualNetwork && manualNetwork.psk ? this._renderSecretInputRow() : null}
        </View>
      );
    }

    const { selectedDeviceNetwork } = this.props;
    if (!selectedDeviceNetwork) {
      return null;
    }
    if (selectedDeviceNetwork && selectedDeviceNetwork.psk) {
      return this._renderSecretInputRow();
    }
    return (
      <View style={styles.secretRow}>
        <Text style={styles.noPskLabel}>
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
    this.props.onDeviceNetworkSelected(network);
    this._dismissWifiModal();
  };

  _scrollToSelectedWifiRow = () => {
    this.refs.wifiNetworkSelector.scrollToSelectedRow();
  };

  _enterManually = () => {
    log.debug('Entering Wi-Fi information manually.');
    this.props.onSelectEnterManually();
    this._dismissWifiModal();
  };

  _chooseFromList = () => {
    log.debug('Going back to choosing from a list.');
    this.props.onSelectChooseFromDeviceList();
    this._showWifiModal();
  };

  _renderWifiModal() {
    if (!this.state.wifiModalShown) {
      return null;
    }
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
          deviceNetworks={this.props.deviceNetworks}
          selectedNetwork={this.props.selectedDeviceNetwork}
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
    this.props.onManualNetworkPSKChange(psk);
    this._dismissAuthTypeModal();
  };

  _renderAuthTypeModal() {
    if (!this.state.authTypeModalShown) {
      return null;
    }
    const { manualNetwork } = this.props;
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
    const network = this.props.manualEntry ?
      this.props.manualNetwork :
      this.props.selectedDeviceNetwork;
    const {manufacturer, model} = this.props.bleDeviceSession;
    this.props.onSave({
      name: `${manufacturer} ${model}`,
      ssid: network.ssid,
      secret: network.psk ? this.props.secret : null,
    });
    this.props.navigator.pushAsync({
      name: 'DeviceStatus',
      props: this.props,
    });
  };

  render() {
    const network = this.props.manualEntry ?
      this.props.manualNetwork :
      this.props.selectedDeviceNetwork;
    const saveButtonDisabled =
      !network ||
      !network.ssid ||
      (network.psk && this.props.secret.length < 8);

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
        <View>
          {this._renderWifiModal()}
          {this._renderAuthTypeModal()}
        </View>
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
    alignItems: 'flex-end',
    marginVertical: 8,
    paddingVertical: 8,
    borderBottomWidth: 3,
    borderBottomColor: 'white',
  },
  ssidLabel: {
    fontFamily: 'OpenSans',
    fontSize: 18,
    color: 'white',
    flex: 1,
    backgroundColor: 'transparent',
  },
  noPskLabel: {
    fontFamily: 'OpenSans-Italic',
    fontSize: 18,
    height: 32,
    color: 'white',
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
    fontFamily: 'OpenSans',
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
