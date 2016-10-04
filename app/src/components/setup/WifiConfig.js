/**
 * @flow
 */

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
import createLog from 'silk-log';

import Button from '../Button';
import WifiNetworkIcon from './WifiNetworkIcon';
import WifiNetworkSelector from './WifiNetworkSelector';
import Selector from './Selector';
import SetupScreen from './SetupScreen';

import * as actions from '../../store/actions';

import type {DeviceWifiNetwork} from 'silk-app-client/src/ble/device_session';
import type {GlobalProps} from '../Root';

const log = createLog('WifiConfig');

export default class WifiConfig extends React.Component {

  props: GlobalProps;

  state = {
    secretShown: false,
    wifiModalShown: false,
    authTypeModalShown: false,
  };

  componentWillMount() {
    this.props.dispatch(actions.wifiConfig.clearState());
    this.props.dispatch(actions.wifiConfig.getLocalInfo());
  }

  _renderSSIDControls() {
    const {wifiConfig} = this.props;
    if (wifiConfig.manualEntry) {
      const {manualNetwork} = wifiConfig;
      return (
        <View style={styles.ssidRow}>
          <TextInput
            ref="ssid"
            placeholder="Enter Wi-Fi name"
            autoCorrect={false}
            autoCapitalize="none"
            value={manualNetwork.ssid}
            style={styles.textInput}
            onChangeText={this._onManualNetworkSSIDChange}
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

    if (!wifiConfig.attemptedWifiMatch) {
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
    const {selectedDeviceNetwork} = wifiConfig;
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
    const {secretShown} = this.state;
    return (
      <View style={styles.secretRow}>
        <TextInput
          ref="secret"
          secureTextEntry={!secretShown}
          autoCorrect={false}
          autoCapitalize="none"
          placeholder="Enter Wi-Fi password"
          value={this.props.wifiConfig.password}
          style={styles.textInput}
          onChangeText={this._onPasswordChange}
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
    const {wifiConfig} = this.props;
    if (wifiConfig.manualEntry) {
      const {manualNetwork} = wifiConfig;
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

    const {selectedDeviceNetwork} = wifiConfig;
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

  _selectNetwork = (network: DeviceWifiNetwork) => {
    this.props.dispatch(actions.wifiConfig.selectFromList(network));
    this._dismissWifiModal();
  };

  _scrollToSelectedWifiRow = () => {
    this.refs.wifiNetworkSelector.scrollToSelectedRow();
  };

  _enterManually = () => {
    log.debug('Entering Wi-Fi information manually.');
    this.props.dispatch(actions.wifiConfig.enterManually());
    this._dismissWifiModal();
  };

  _chooseFromList = () => {
    log.debug('Going back to choosing from a list.');
    this.props.dispatch(actions.wifiConfig.selectFromList());
    this._showWifiModal();
  };

  _onManualNetworkSSIDChange = (ssid: string) => {
    this.props.dispatch(actions.wifiConfig.setManualSSID(ssid));
  };

  _onPasswordChange = (password: string) => {
    this.props.dispatch(actions.wifiConfig.setPassword(password));
  };

  _renderWifiModal() {
    if (!this.state.wifiModalShown) {
      return null;
    }
    const {wifiConfig} = this.props;
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
          deviceNetworks={wifiConfig.deviceNetworks}
          selectedNetwork={wifiConfig.selectedDeviceNetwork}
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

  _onSelectAuthType = (psk: boolean) => {
    this.props.dispatch(actions.wifiConfig.setManualPSK(psk));
    this._dismissAuthTypeModal();
  };

  _renderAuthTypeModal() {
    if (!this.state.authTypeModalShown) {
      return null;
    }
    const {manualNetwork} = this.props.wifiConfig;
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

  _onCancel = () => {
    this.props.dispatch(actions.devices.config.abort());
  };

  _onSave = () => {
    const {wifiConfig} = this.props;
    const network = wifiConfig.manualEntry ?
      wifiConfig.manualNetwork :
      wifiConfig.selectedDeviceNetwork;

    this.props.dispatch(actions.devices.config.setConfig({
      name: 'Silk Device',
      wifiSSID: network.ssid,
      wifiPassword: network.psk ? wifiConfig.password : null,
    }));
  };

  render() {
    const {wifiConfig} = this.props;
    const network = wifiConfig.manualEntry ?
      wifiConfig.manualNetwork :
      wifiConfig.selectedDeviceNetwork;
    const saveButtonDisabled =
      !network ||
      !network.ssid ||
      (network.psk && wifiConfig.password.length < 8);

    return (
      <SetupScreen
        title="Which Wi-Fi network should your device connect to?"
        subtitle="Your Wi-Fi password won't leave your house."
        secondaryButton={
          <Button
            type="secondary"
            onPress={this._onCancel}
            label="Cancel"
            style={styles.cancelButton}
          />
        }
        primaryButton={
          <Button
            type="primary"
            onPress={this._onSave}
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
