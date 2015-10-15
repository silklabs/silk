/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

var React = require('react-native');
var {
  PixelRatio,
  ScrollView,
  StyleSheet,
  // NB: wifi settings dialog uses its own iOS "system" style, not the
  // common Silk style.
  SwitchIOS,
  Text,
  TextInput,
  TouchableHighlight,
  TouchableOpacity,
  View,
} = React;
import AsyncComponent from './AsyncComponent';

const MIN_CONTENT_INSET_BOTTOM = 20;

export default class WifiSettings extends AsyncComponent {

  constructor(props) {
    super(props);
    let hints = props.route.hints;
    this.state = {
      ssid: hints.ssid,
      secret: hints.secret,
      serverUrl: hints.serverUrl,
      showSecret: false,
    };
  }

  _renderTitle() {
    return (
      <View style={styles.titleContainer}>
        <View style={styles.spacer}>
          <TouchableOpacity onPress={this.cancel}>
            <View style={styles.titleButton}>
              <Text style={styles.cancel}>Cancel</Text>
            </View>
          </TouchableOpacity>
        </View>
        <Text style={styles.title}>Settings</Text>
        <View style={styles.spacer}>
          <TouchableOpacity onPress={this.save}>
            <View style={styles.titleButton}>
              <Text style={styles.save}>Save</Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  _renderWifiSettings() {
    return (
      <View style={styles.form}>
        <View style={[styles.formRow, styles.formRowFirst]}>
          <View style={styles.formRowLabelContainer}>
            <Text style={styles.formRowLabel}>Network</Text>
          </View>
          <View style={styles.formInputContainer}>
            <TextInput
              ref="ssid"
              placeholder="Enter WiFi network name"
              value={this.state.ssid}
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.formInput}
              onChangeText={ssid => this.setState({ssid})}
            />
          </View>
        </View>
        <View style={styles.formRow}>
          <View style={styles.formRowLabelContainer}>
            <Text style={styles.formRowLabel}>Password</Text>
          </View>
          <View style={styles.formInputContainer}>
            <TextInput
              ref="secret"
              secureTextEntry={!this.state.showSecret}
              placeholder="Enter WiFi password"
              value={this.state.secret}
              autoFocus={true}
              style={styles.formInput}
              onChangeText={secret => this.setState({secret})}
            />
          </View>
        </View>
        <View style={styles.formRow}>
          <View style={styles.formRowLabelContainer}>
            <Text style={styles.formRowLabel}>
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

  _renderAccountSettings() {
    return (
      <View
        style={styles.form}>
        <TouchableHighlight
          underlayColor="lightgrey"
          onPress={this.signOut}
          style={[styles.formRow, styles.formRowFirst]}>
          <Text style={styles.signOutButtonLabel}>
            Sign Out
          </Text>
        </TouchableHighlight>
      </View>
    );
  }

  render() {
    return (
      <View style={styles.container}>
        {this._renderTitle()}

        <ScrollView
          keyboardShouldPersistTaps={false}
          contentInset={{bottom: MIN_CONTENT_INSET_BOTTOM}}
          style={styles.scrollView}>
          <Text style={styles.formHeader}>WIFI</Text>
          {this._renderWifiSettings()}
          <Text style={styles.formHeader}>ACCOUNT</Text>
          {this._renderAccountSettings()}
        </ScrollView>
      </View>
    );
  }

  cancel = () => {
    if (this.props.route.reject) {
      this.props.route.reject();
    }
    this.props.navigator.popAsync();
  };

  save = () => {
    let { serverUrl } = this.state;
    if (typeof serverUrl === 'string' &&
        serverUrl.indexOf('http://') !== 0 &&
        serverUrl.indexOf('https://') !== 0) {
      serverUrl = 'http://' + serverUrl;
    }
    if (this.props.route.resolve) {
      this.props.route.resolve({
        ssid: this.state.ssid,
        secret: this.state.secret,
        serverUrl,
      });
    }
    // TODO save wifi to persistent DB --- here or elsewhere?
    this.props.navigator.popAsync();
  };

  signOut = async () => {
    await this.props.userState.signOut();
  };

}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#f4f4f6',
    flex: 1,
  },
  titleContainer: {
    justifyContent: 'center',
    flexDirection: 'row',
    paddingTop: 22,
  },
  spacer: {
    flex: 1,
  },
  title: {
    color: 'black',
    fontSize: 17,
    textAlign: 'center',
    fontWeight: '500',
    paddingTop: 8,
  },
  titleButton: {
    padding: 8,
  },
  save: {
    color: '#007aff',
    fontSize: 18,
    fontWeight: '500',
    textAlign: 'right',
  },
  cancel: {
    color: '#007aff',
    fontSize: 17,
    textAlign: 'left',
  },

  scrollView: {
    backgroundColor: '#efeff4',
    borderColor: '#a7a7aa',
    borderTopWidth: 1 / PixelRatio.get(),
    flex: 1,
  },

  formHeader: {
    fontWeight: '500',
    color: '#404e55',
    marginTop: 16,
    marginLeft: 8,
    marginBottom: 4,
  },
  form: {
    backgroundColor: 'white',
    borderTopWidth: 1 / PixelRatio.get(),
    borderBottomWidth: 1 / PixelRatio.get(),
    borderColor: '#c8c7cc',
    flex: 1,
  },
  formRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderColor: '#c8c7cc',
    borderTopWidth: 1 / PixelRatio.get(),
    height: 46,
    paddingLeft: 16,
    paddingRight: 8,
  },
  formRowFirst: {
    borderTopWidth: 0,
  },
  formRowLabelContainer: {
    flex: 1,
  },
  formRowLabel: {
    fontSize: 17,
  },
  formInputContainer: {
    flex: 2,
  },
  formInput: {
    height: 44,
    fontSize: 17,
    flex: 1,
  },

  signOutButtonLabel: {
    color: '#007aff',
    fontSize: 17,
  },
});
