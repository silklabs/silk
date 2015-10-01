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

export default class WifiSettings extends React.Component {

  constructor(props) {
    super(props);
    let hints = props.route.hints;
    this.state = {
      ssid: hints.ssid || 'Network Name',
      secret: hints.secret || 'silkysmooth',
      socketUrl: hints.socketUrl,
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
              value={this.state.secret}
              autoFocus={true}
              style={styles.formInput}
              onChangeText={secret => this.setState({secret})}
            />
          </View>
        </View>
      </View>
    );
  }

  _renderAccountSettings() {
    return (
      <TouchableHighlight
        underlayColor="lightgrey"
        style={styles.form}
        onPress={this.signOut}>
        <View style={[styles.formRow, styles.formRowFirst]}>
          <Text style={styles.signOutButtonLabel}>
            Sign Out
          </Text>
        </View>
      </TouchableHighlight>
    );
  }

  _renderDebugSettings() {
    return (
      <View style={styles.form}>
        <View style={[styles.formRow, styles.formRowFirst]}>
          <View style={styles.switchLabelContainer}>
            <Text style={styles.formRowLabel}>
              Show WiFi password
            </Text>
          </View>
          <SwitchIOS
            value={this.state.showSecret}
            onValueChange={showSecret => this.setState({showSecret})}
          />
        </View>
        <View style={styles.formRow}>
          <View style={styles.formRowLabelContainer}>
            <Text style={styles.formRowLabel}>Server</Text>
          </View>
          <View style={styles.formInputContainer}>
            <TextInput
              ref="socketUrl"
              value={this.state.socketUrl}
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.formInput}
              onChangeText={socketUrl => this.setState({socketUrl})}
            />
          </View>
        </View>
      </View>
    );
  }

  render() {
    // TODO: clean this up for production (remove server setting).
    return (
      <View style={styles.container}>
        {this._renderTitle()}

        <ScrollView
          keyboardShouldPersistTaps={false}
          style={styles.scrollView}>
          <Text style={styles.formHeader}>WIFI</Text>
          {this._renderWifiSettings()}
          <Text style={styles.formHeader}>ACCOUNT</Text>
          {this._renderAccountSettings()}
          <Text style={styles.formHeader}>DEBUG</Text>
          {this._renderDebugSettings()}
        </ScrollView>
      </View>
    );
  }

  cancel = () => {
    if (this.props.route.reject) {
      this.props.route.reject();
    }
    this.props.navigator.pop();
  };

  save = () => {
    if (this.props.route.resolve) {
      this.props.route.resolve({
        ssid: this.state.ssid,
        secret: this.state.secret,
        socketUrl: this.state.socketUrl,
      });
    }
    // TODO save wifi to persistent DB --- here or elsewhere?
    this.props.navigator.pop();
  };

  signOut = async () => {
    let { userState, navigator } = this.props;
    await userState.signOut();
    navigator.push({ name: 'SignIn', index: 0 });
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
    borderTopWidth: 0.5,
    flex: 1,
  },
  contentSpacer: {
    height: 34,
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
    paddingLeft: 16,
    paddingRight: 8,
    flex: 1,
  },
  formRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderColor: '#c8c7cc',
    borderTopWidth: 1 / PixelRatio.get(),
    height: 46,
  },
  formRowFirst: {
    borderTopWidth: 0,
  },
  formRowLabelContainer: {
    width: 90,
  },
  formRowLabel: {
    fontSize: 17,
  },
  formInputContainer: {
    flex: 1,
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

  switchLabelContainer: {
    flex: 1,
  },

});
