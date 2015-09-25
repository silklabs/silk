/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

var React = require('react-native');
var {
  ScrollView,
  StyleSheet,
  // NB: wifi settings dialog uses its own iOS "system" style, not the
  // common Silk style.
  Text,
  TextInput,
  TouchableOpacity,
  View,
} = React;

var Title = React.createClass({
  render: function() {
    return (
      <View style={styles.titleContainer}>
        <View style={styles.spacer}>
          <TouchableOpacity onPress={this.props.onCancel}>
            <View style={styles.titleButton}>
              <Text style={styles.cancel}>Cancel</Text>
            </View>
          </TouchableOpacity>
        </View>
        <Text style={styles.title}>Wi-Fi Settings</Text>
        <View style={styles.spacer}>
          <TouchableOpacity onPress={this.props.onSave}>
            <View style={styles.titleButton}>
              <Text style={styles.save}>Save</Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>
    );
  },
});

var WifiSettings = React.createClass({
  getInitialState: function() {
    return {
      ssid: this.props.hints.ssid || 'Network Name',
      secret: this.props.hints.secret || 'silkysmooth',
      serverUrl: this.props.hints.serverUrl
    };
  },

  render: function() {
    // TODO: remove <ScrollView> and "debug settings" below for
    // production.
    return (
      <View style={styles.container}>
        <Title onSave={this.save} onCancel={this.cancel} />

        <ScrollView>
        <View style={styles.contentContainer}>
          <View style={styles.contentSpacer} />

          <View style={styles.formContainer}>
            <View style={styles.formLeftSpace} />

            <View style={styles.form}>
              <View style={styles.formRow}>
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
                    onChangeText={(text) => this.setState({ssid: text})}
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
                    secureTextEntry={true}
                    value={this.state.secret}
                    autoFocus={true}
                    style={styles.formInput}
                    onChangeText={(text) => this.setState({secret: text})}
                  />
                </View>
              </View>

            </View>
          </View>


          <View style={styles.debugSettingsSpacer} />
          <View style={styles.formContainer}>
            <View style={styles.formLeftSpace} />

            <View style={styles.form}>
              <View style={styles.formRow}>
                <View style={styles.formRowLabelContainer}>
                  <Text style={styles.formRowLabel}>Server</Text>
                </View>
                <View style={styles.formInputContainer}>
                  <TextInput
                    ref="serverUrl"
                    value={this.state.serverUrl}
                    autoCapitalize="none"
                    autoCorrect={false}
                    style={styles.formInput}
                    onChangeText={(text) => this.setState({serverUrl: text})}
                  />
                </View>
              </View>
            </View>
          </View>

        </View>
        </ScrollView>
      </View>
    );
  },

  cancel: function() {
    if (this.props.reject) {
      this.props.reject();
    }
    this.props.navigator.pop();
  },

  save: function() {
    if (this.props.resolve) {
      this.props.resolve(this.state);
    }
    // TODO save wifi to persistent DB --- here or elsewhere?
    this.props.navigator.pop();
  },
});

var styles = StyleSheet.create({
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
    paddingTop: 10,
  },
  titleButton: {
    paddingLeft: 10,
    paddingRight: 10,
    paddingTop: 10,
    paddingBottom: 10,
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

  contentContainer: {
    backgroundColor: '#efeff4',
    borderColor: '#a7a7aa',
    borderTopWidth: 0.5,
    flex: 1,
  },
  contentSpacer: {
    height: 34,
  },

  formContainer: {
    backgroundColor: 'white',
    borderBottomWidth: 0.5,
    borderColor: '#c8c7cc',
    flexDirection: 'row',
  },
  formLeftSpace: {
    borderColor: '#c8c7cc',
    borderTopWidth: 0.5,
    width: 20,
    height: 39,
  },
  form: {
    flex: 1,
  },
  formRow: {
    flex: 1,
    flexDirection: 'row',
    borderColor: '#c8c7cc',
    borderTopWidth: 0.5,
  },
  formRowLabelContainer: {
    width: 90,
    paddingTop: 10,
    paddingBottom: 10,
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

  debugSettingsSpacer: {
    height: 400,
  },
});

module.exports = WifiSettings;
