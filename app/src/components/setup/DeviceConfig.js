import React from 'react-native';
let {
  InteractionManager,
  ScrollView,
  StyleSheet,
  SwitchIOS,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} = React;

import { getWifiInfo } from '../../libraries/Util';
import { DeviceSession } from '../../libraries/ble/DeviceManager';

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
    ssid: '',
    secret: '',
    showSecret: false,
  };

  mounted = false;

  componentWillMount() {
    this.mounted = true;
    getWifiInfo().then((info) => this.setState({ssid: info.SSID}));
    InteractionManager.runAfterInteractions(() => {
      if (this.mounted) {
        this.refs.secret.focus();
      }
    });
  }

  componentWillUnmount() {
    this.mounted = false;
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
              placeholder="Enter WiFi network name"
              clearButtonMode="always"
              value={this.state.ssid}
              autoCapitalize="none"
              autoCorrect={false}
              style={FormStyles.formInput}
              onChangeText={ssid => this.setState({ssid})}
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
              placeholder="Enter WiFi password"
              clearButtonMode="always"
              value={this.state.secret}
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
      </View>
    );
  }

  _handleSave = () => {
    this.props.onSave({
      deviceId: this.props.deviceSecret.deviceId,
      name: this.state.name,
      ssid: this.state.ssid,
      secret: this.state.secret,
    });
  };

  render() {
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
          <TouchableOpacity
            onPress={this._handleSave}
            style={TitleBarStyles.titleBarRightButton}>
            <Text style={TitleBarStyles.titleBarButtonLabel}>Save</Text>
          </TouchableOpacity>
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
  },
});
