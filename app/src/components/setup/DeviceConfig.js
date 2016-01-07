import React from 'react-native';
let {
  InteractionManager,
  ScrollView,
  StyleSheet,
  SwitchIOS,
  PickerIOS,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} = React;

import { DeviceSession, DeviceWifiNetworks } from '../../libraries/ble/DeviceManager';

import { LayoutStyles, FormStyles, TitleBarStyles } from '../CommonStyles';

export default class DeviceConfig extends React.Component {

  static propTypes = {
    bleDeviceSession: React.PropTypes.instanceOf(DeviceSession).isRequired,
    deviceSecret: React.PropTypes.shape({
      deviceId: React.PropTypes.string.isRequired,
    }).isRequired,
    onSave: React.PropTypes.func.isRequired,
    onCancel: React.PropTypes.func.isRequired,
  };

  state = {
    name: `${this.props.bleDeviceSession.manufacturer} ${this.props.bleDeviceSession.model}`,
    networks: [],
    ssid: '',
    psk: true,
    secret: '',
    showSecret: false,
  };

  mounted = false;

  componentWillMount() {
    this.mounted = true;
    let { bleDeviceSession } = this.props;
    bleDeviceSession.on('wifiscan', this._onWifiScan);
    this._onWifiScan(bleDeviceSession.wifiNetworks);
    InteractionManager.runAfterInteractions(() => {
      if (this.mounted) {
        this.refs.secret.focus();
      }
    });
  }

  _onWifiScan : ((networks: DeviceWifiNetworks) => void) = (networks) => {
    let { ssid, psk } = this.state;

    // Sort by signal strength
    networks = networks.sort((a, b) => b.level - a.level);

    // If an ssid has not yet been selected or manually entered, choose the
    // first scan result
    if (networks.length > 0 && this.state.ssid === '') {
      ssid = networks[0].ssid;
      psk = networks[0].psk;
    }
    this.setState({ networks, ssid, psk });
  };

  componentWillUnmount() {
    this.mounted = false;
    let { bleDeviceSession } = this.props;
    bleDeviceSession.removeListener('wifiscan', this._onWifiScan);
  }

  _renderDeviceSettings() {
    return (
      <View style={FormStyles.form}>
        <View style={[FormStyles.formRow, FormStyles.formRowFirst]}>
          <View style={FormStyles.formRowLabelContainer}>
            <Text style={FormStyles.formRowLabel}>Name</Text>
          </View>
          <View style={FormStyles.formInputContainer}>
            <TextInput
              ref="ssid"
              placeholder="Enter device name"
              clearButtonMode="always"
              value={this.state.name}
              autoCapitalize="words"
              autoCorrect={false}
              style={FormStyles.formInput}
              onChangeText={name => this.setState({name})}
            />
          </View>
        </View>
      </View>
    );
  }

  _onChangeSSID = (ssid) => {
    const psk = ssid === '' ||
      this.state.networks.some(network => {
        return (network.ssid === ssid) && network.psk;
      });
    this.setState({ssid, psk});
  };

  _renderWifiSettings() {
    return (
      <View style={FormStyles.form}>
        <View style={[FormStyles.formRow, FormStyles.formRowFirst]}>
          <View style={FormStyles.formRowLabelContainer}>
            <Text style={FormStyles.formRowLabel}>Network</Text>
          </View>
          <View style={FormStyles.formInputContainer}>
            <TextInput
              ref="ssid"
              placeholder={this.state.networks.length === 0 ?
                'Searching...' : 'Enter WiFi network name'}
              clearButtonMode="always"
              value={this.state.ssid}
              autoCapitalize="none"
              autoCorrect={false}
              style={FormStyles.formInput}
              onChangeText={this._onChangeSSID}
            />
          </View>
        </View>
        <View style={FormStyles.formRow}>
          <View style={FormStyles.formRowLabelContainer}>
            <Text style={FormStyles.formRowLabel}>Password</Text>
          </View>
          <View style={FormStyles.formInputContainer}>
            <TextInput
              ref="secret"
              secureTextEntry={!this.state.showSecret}
              placeholder={this.state.psk ? 'Enter WiFi password' : 'None'}
              editable={this.state.psk}
              clearButtonMode="always"
              value={this.state.psk ? this.state.secret : ''}
              style={FormStyles.formInput}
              onChangeText={secret => this.setState({secret})}
            />
          </View>
        </View>
        <View style={FormStyles.formRow}>
          <View style={FormStyles.formRowLabelContainer}>
            <Text style={FormStyles.formRowLabel}>
              Show WiFi password
            </Text>
          </View>
          <SwitchIOS
            value={this.state.showSecret}
            onValueChange={showSecret => this.setState({showSecret})}
          />
        </View>
        <View style={FormStyles.formRow}>
          <View style={FormStyles.formRowLabelContainer}>
            <Text style={FormStyles.formRowLabel}>
              Open Network
            </Text>
          </View>
          <SwitchIOS
            value={!this.state.psk}
            onValueChange={(open) => this.setState({psk: !open})}
          />
        </View>
        <PickerIOS
          itemStyle={{flex: 1}}
          selectedValue={this.state.ssid}
          onValueChange={this._onChangeSSID}>
          {this.state.networks.map((network, index) => (
            <PickerIOS.Item
              key={network.ssid + network.psk}
              value={network.ssid}
              label={network.ssid + ' (' + network.level + ' dBm)'}
            />
          ))}
        </PickerIOS>
      </View>
    );
  }

  _handleSave = () => {
    this.props.onSave({
      deviceId: this.props.deviceSecret.deviceId,
      name: this.state.name,
      ssid: this.state.ssid,
      secret: this.state.psk ? this.state.secret : null,
    });
  };

  render() {
    let saveButtonLabel = (
      <Text style={TitleBarStyles.titleBarButtonLabel}>Save</Text>
    );
    let saveButton;
    if (this.state.ssid.length === 0 ||
         (this.state.psk && this.state.secret.length < 8)) {
      saveButton = (
        <View style={[TitleBarStyles.titleBarRightButton, styles.disabledButton]}>
          {saveButtonLabel}
        </View>
      );
    } else {
      saveButton = (
        <TouchableOpacity
          onPress={this._handleSave}
          style={TitleBarStyles.titleBarRightButton}>
          {saveButtonLabel}
        </TouchableOpacity>
      );
    }

    return (
      <ScrollView
        keyboardShouldPersistTaps={false}
        alwaysBounceVertical={false}
        style={styles.container}>
        <View style={LayoutStyles.statusBarPlaceholder} />
        <View style={TitleBarStyles.titleBar}>
          <TouchableOpacity
            onPress={this.props.onCancel}
            style={TitleBarStyles.titleBarLeftButton}>
            <Text style={TitleBarStyles.titleBarButtonLabel}>Cancel</Text>
          </TouchableOpacity>
          <Text style={TitleBarStyles.titleBarLabel}>Device Setup</Text>
          {saveButton}
        </View>
        <View style={styles.contentContainer}>
          <Text style={FormStyles.formHeader}>DEVICE</Text>
          {this._renderDeviceSettings()}
          <Text style={FormStyles.formHeader}>WIFI</Text>
          {this._renderWifiSettings()}
        </View>
      </ScrollView>
    );
  }

}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'white',
  },
  contentContainer: {
    flex: 1,
    marginBottom: 250,
  },
  disabledButton: {
    opacity: 0.5,
  },
});
